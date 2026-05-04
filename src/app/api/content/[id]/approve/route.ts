import { NextRequest, NextResponse } from 'next/server';

import { logContentEvent, validateApproveRequest } from '@/lib/contentOperations';
import { getAdminRouteContext } from '@/lib/serverAuth';
import { DailyContentRow } from '@/lib/types';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email } = await getAdminRouteContext(request);
    const { id } = await params;

    const content = await supabase
      .from('daily_contents')
      .select('id, app_playback_url, shortform_video_url, publish_mode, publish_at, workflow_status, app_publish_status')
      .eq('id', id)
      .maybeSingle<Pick<
        DailyContentRow,
        'id' | 'app_playback_url' | 'shortform_video_url' | 'publish_mode' | 'publish_at' | 'workflow_status' | 'app_publish_status'
      >>();

    if (content.error || !content.data) {
      return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 });
    }

    const validationError = validateApproveRequest(content.data);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const nextStatus =
      content.data.publish_mode === 'scheduled' && content.data.publish_at ? 'scheduled' : 'approved';

    const { error } = await supabase
      .from('daily_contents')
      .update({
        workflow_status: nextStatus,
        approved_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    try {
      await logContentEvent(supabase, {
        dailyContentId: id,
        eventType: nextStatus === 'scheduled' ? 'scheduled' : 'approved',
        actorEmail: email,
        detail: {
          publishAt: content.data.publish_at,
          workflowStatus: nextStatus,
          assetType: content.data.app_playback_url ? 'app_playback_url' : 'shortform_video_url',
        },
      });
    } catch (eventError) {
      console.error('[approve route] content_events insert failed', eventError);
    }

    return NextResponse.json({ ok: true, workflowStatus: nextStatus });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '승인 처리에 실패했습니다.' },
      { status: 401 },
    );
  }
}
