import { NextRequest, NextResponse } from 'next/server';

import { logContentEvent, validateRetryRenderRequest } from '@/lib/contentOperations';
import { getAdminRouteContext } from '@/lib/serverAuth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email } = await getAdminRouteContext(request);
    const { id } = await params;

    const content = await supabase
      .from('daily_contents')
      .select('id, workflow_status, background_asset_path')
      .eq('id', id)
      .maybeSingle();

    if (content.error || !content.data) {
      return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 });
    }

    const validationError = validateRetryRenderRequest(content.data);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const [jobResult, updateResult] = await Promise.all([
      supabase.from('render_jobs').insert({
        daily_content_id: id,
        status: 'pending',
        attempts: 0,
        error_message: null,
        started_at: null,
        finished_at: null,
      }),
      supabase.from('daily_contents').update({
        workflow_status: 'rendering',
        last_error: null,
      }).eq('id', id),
    ]);

    if (jobResult.error || updateResult.error) {
      return NextResponse.json(
        {
          error: jobResult.error?.message || updateResult.error?.message || '렌더 재시도 등록에 실패했습니다.',
        },
        { status: 400 },
      );
    }

    try {
      await logContentEvent(supabase, {
        dailyContentId: id,
        eventType: 'retry_requested',
        actorEmail: email,
        detail: {
          target: 'render',
        },
      });
    } catch (eventError) {
      console.error('[retry-render route] content_events insert failed', eventError);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '렌더 재시도 등록에 실패했습니다.' },
      { status: 401 },
    );
  }
}
