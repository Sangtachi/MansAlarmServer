import { NextRequest, NextResponse } from 'next/server';

import { logContentEvent } from '@/lib/contentOperations';
import { getAdminRouteContext } from '@/lib/serverAuth';
import { DailyContentRow } from '@/lib/types';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email } = await getAdminRouteContext(_request);
    const { id } = await params;

    const contentResult = await supabase
      .from('daily_contents')
      .select('id, workflow_status, app_publish_status, is_published')
      .eq('id', id)
      .maybeSingle<Pick<DailyContentRow, 'id' | 'workflow_status' | 'app_publish_status' | 'is_published'>>();

    if (contentResult.error || !contentResult.data) {
      return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 });
    }

    const isLive =
      contentResult.data.is_published
      || contentResult.data.workflow_status === 'published'
      || contentResult.data.app_publish_status === 'approved_live';

    if (!isLive) {
      return NextResponse.json({ error: '이미 비공개 상태입니다.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('daily_contents')
      .update({
        workflow_status: 'draft',
        app_publish_status: 'draft',
        is_published: false,
        active_publish_request_id: null,
        approved_at: null,
        published_at: null,
        last_error: null,
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    try {
      await logContentEvent(supabase, {
        dailyContentId: id,
        eventType: 'content_updated',
        actorEmail: email,
        detail: {
          action: 'unpublish',
          previousWorkflowStatus: contentResult.data.workflow_status,
          previousAppPublishStatus: contentResult.data.app_publish_status,
        },
      });
    } catch (eventError) {
      console.error('[unpublish route] content_events insert failed', eventError);
    }

    return NextResponse.json({
      ok: true,
      workflowStatus: 'draft',
      appPublishStatus: 'draft',
      isPublished: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '비공개 처리에 실패했습니다.' },
      { status: 401 },
    );
  }
}
