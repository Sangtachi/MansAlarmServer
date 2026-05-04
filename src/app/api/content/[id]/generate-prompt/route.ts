import { NextRequest, NextResponse } from 'next/server';

import { buildPromptDraft } from '@/lib/contentStudio';
import { logContentEvent } from '@/lib/contentOperations';
import { getAdminRouteContext } from '@/lib/serverAuth';
import { ContentSeasonRow, DailyContentRow } from '@/lib/types';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email } = await getAdminRouteContext(request);
    const { id } = await params;

    const contentResult = await supabase
      .from('daily_contents')
      .select('id, season_id, archetype, generator_provider, phrase, sub_phrase, description, generation_prompt_final')
      .eq('id', id)
      .maybeSingle<Pick<
        DailyContentRow,
        'id' | 'season_id' | 'archetype' | 'generator_provider' | 'phrase' | 'sub_phrase' | 'description' | 'generation_prompt_final'
      >>();

    if (contentResult.error || !contentResult.data) {
      return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 });
    }

    const content = contentResult.data;
    if (!content.generator_provider) {
      return NextResponse.json({ error: '생성 툴(provider)을 먼저 선택해야 합니다.' }, { status: 400 });
    }

    let season: ContentSeasonRow | null = null;
    if (content.season_id) {
      const seasonResult = await supabase
        .from('content_seasons')
        .select('*')
        .eq('id', content.season_id)
        .maybeSingle<ContentSeasonRow>();

      if (seasonResult.error) {
        return NextResponse.json({ error: seasonResult.error.message }, { status: 400 });
      }
      season = seasonResult.data ?? null;
    }

    const promptDraft = buildPromptDraft({
      season,
      archetype: content.archetype,
      provider: content.generator_provider,
      phrase: content.phrase,
      subPhrase: content.sub_phrase,
      description: content.description,
    });

    const updatePayload: Partial<DailyContentRow> = {
      generation_prompt_draft: promptDraft,
    };

    if (!content.generation_prompt_final?.trim()) {
      updatePayload.generation_prompt_final = promptDraft;
    }

    const updateResult = await supabase
      .from('daily_contents')
      .update(updatePayload)
      .eq('id', id);

    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 400 });
    }

    try {
      await logContentEvent(supabase, {
        dailyContentId: id,
        eventType: 'content_updated',
        actorEmail: email,
        detail: {
          target: 'generation_prompt',
          provider: content.generator_provider,
          seasonId: content.season_id,
        },
      });
    } catch (eventError) {
      console.error('[generate-prompt route] content_events insert failed', eventError);
    }

    return NextResponse.json({
      ok: true,
      promptDraft,
      season,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프롬프트 생성에 실패했습니다.' },
      { status: 401 },
    );
  }
}
