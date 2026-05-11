import { NextRequest, NextResponse } from 'next/server';

import { getKstTodayYmd } from '@/lib/contentGenerator';
import { requireCronSecret } from '@/lib/cronSecretAuth';
import { getServiceRoleSupabase } from '@/lib/supabaseServiceRole';
import { ensureUpcomingContentDrafts } from '@/lib/upcomingContentBatch';

export const dynamic = 'force-dynamic';

const DEFAULT_SEED_DAYS = 7;

function parseSeedDays(value: string | null) {
  const parsed = Number.parseInt(value ?? process.env.DAILY_CONTENT_SEED_DAYS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SEED_DAYS;
  }
  return Math.min(30, parsed);
}

async function runSeed(request: NextRequest) {
  const supabase = getServiceRoleSupabase();
  const startDate = request.nextUrl.searchParams.get('startDate') || getKstTodayYmd();
  const days = parseSeedDays(request.nextUrl.searchParams.get('days'));
  const result = await ensureUpcomingContentDrafts(supabase, {
    startDate,
    days,
    preferredSeasonId: null,
    generatorProvider: 'veo',
    seedArchetype: null,
    publishMode: 'scheduled',
    actorEmail: 'cron@mansalarm.system',
    source: 'cron_daily_contents_seed',
  });

  console.log(
    JSON.stringify({
      job: 'daily-contents-seed',
      level: 'info',
      createdDates: result.createdDates,
      skippedDates: result.skippedDates,
      reusedDates: result.reusedDates,
      targetDates: result.targetDates,
      startDate,
      days,
      generationBackend: result.generationBackend,
      usedFallback: result.usedFallback,
      fallbackReason: result.fallbackReason,
    }),
  );

  return result;
}

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) {
    return denied;
  }

  try {
    const result = await runSeed(request);
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      JSON.stringify({
        job: 'daily-contents-seed',
        level: 'error',
        step: 'unhandled',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'seed failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
