import { NextRequest, NextResponse } from 'next/server';

import {
  GENERATED_DRAFT_WINDOW_LIMIT,
  addDaysToYmd,
  getKstTodayYmd,
  isContentArchetype,
  isGeneratorProvider,
  isPublishMode,
} from '@/lib/contentGenerator';
import { ensureUpcomingContentDrafts } from '@/lib/upcomingContentBatch';
import { getAdminRouteContext } from '@/lib/serverAuth';
import { ContentArchetype, ContentSeasonRow, GeneratorProvider, PublishMode } from '@/lib/types';

type GenerateUpcomingRequest = {
  days?: number;
  startDate?: string;
  seasonId?: string | null;
  generatorProvider?: GeneratorProvider;
  archetype?: ContentArchetype;
  publishMode?: PublishMode;
};

function isValidYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await getAdminRouteContext(request);
    const payload = (await request.json().catch(() => ({}))) as GenerateUpcomingRequest;

    const days = Math.min(
      GENERATED_DRAFT_WINDOW_LIMIT,
      Math.max(1, Number.isFinite(payload.days) ? Number(payload.days) : 7),
    );
    const startDate = typeof payload.startDate === 'string' && isValidYmd(payload.startDate)
      ? payload.startDate
      : addDaysToYmd(getKstTodayYmd(), 1);
    const preferredSeasonId = typeof payload.seasonId === 'string' && payload.seasonId.trim()
      ? payload.seasonId.trim()
      : null;
    const generatorProvider = typeof payload.generatorProvider === 'string' && isGeneratorProvider(payload.generatorProvider)
      ? payload.generatorProvider
      : 'veo';
    const seedArchetype = typeof payload.archetype === 'string' && isContentArchetype(payload.archetype)
      ? payload.archetype
      : null;
    const publishMode = typeof payload.publishMode === 'string' && isPublishMode(payload.publishMode)
      ? payload.publishMode
      : 'scheduled';

    // Validate seasons exist before calling into the shared batch logic.
    const seasonsResult = await supabase
      .from('content_seasons')
      .select('*')
      .order('month_key', { ascending: false });

    if (seasonsResult.error) {
      return NextResponse.json({ error: seasonsResult.error.message }, { status: 400 });
    }

    const seasons = (seasonsResult.data ?? []) as ContentSeasonRow[];
    if (seasons.length === 0) {
      return NextResponse.json({ error: '자동 초안을 만들기 전에 월 시즌을 먼저 저장해야 합니다.' }, { status: 400 });
    }

    if (preferredSeasonId && !seasons.some((season) => season.id === preferredSeasonId)) {
      return NextResponse.json({ error: '선택한 시즌을 찾을 수 없습니다.' }, { status: 400 });
    }

    const result = await ensureUpcomingContentDrafts(supabase, {
      startDate,
      days,
      preferredSeasonId,
      generatorProvider,
      seedArchetype,
      publishMode,
      actorEmail: email,
      source: 'admin_generate_upcoming',
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '자동 초안 생성에 실패했습니다.' },
      { status: 401 },
    );
  }
}
