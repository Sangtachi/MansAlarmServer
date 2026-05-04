import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { logContentEvent, validatePublishNowRequest } from '@/lib/contentOperations';
import { getAdminRouteContext } from '@/lib/serverAuth';
import { DailyContentRow } from '@/lib/types';

async function createPublishJobs(
  id: string,
  publishRequestId: string,
  nowIso: string,
  supabase: Awaited<ReturnType<typeof getAdminRouteContext>>['supabase']
) {
  return supabase.from('publish_jobs').insert([
    {
      daily_content_id: id,
      publish_request_id: publishRequestId,
      platform: 'youtube',
      status: 'pending',
      scheduled_for: nowIso,
      attempts: 0,
    },
    {
      daily_content_id: id,
      publish_request_id: publishRequestId,
      platform: 'instagram',
      status: 'pending',
      scheduled_for: nowIso,
      attempts: 0,
    },
  ]);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email } = await getAdminRouteContext(request);
    const { id } = await params;
    const nowIso = new Date().toISOString();
    const publishRequestId = randomUUID();

    const content = await supabase
      .from('daily_contents')
      .select('id, app_playback_url, shortform_video_url, workflow_status, app_publish_status')
      .eq('id', id)
      .maybeSingle<Pick<
        DailyContentRow,
        'id' | 'app_playback_url' | 'shortform_video_url' | 'workflow_status' | 'app_publish_status'
      >>();

    if (content.error || !content.data) {
      return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 });
    }

    const validationError = validatePublishNowRequest(content.data);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const appPlaybackUrl = content.data.app_playback_url || content.data.shortform_video_url;

    const [jobsResult, updateResult] = await Promise.all([
      createPublishJobs(id, publishRequestId, nowIso, supabase),
      supabase
        .from('daily_contents')
        .update({
          app_playback_url: appPlaybackUrl,
          app_publish_status: 'approved_live',
          workflow_status: 'published',
          approved_at: nowIso,
          published_at: nowIso,
          active_publish_request_id: publishRequestId,
          is_published: true,
          youtube_publish_status: 'pending',
          instagram_publish_status: 'pending',
          youtube_last_error: null,
          instagram_last_error: null,
          last_error: null,
        })
        .eq('id', id),
    ]);

    if (jobsResult.error || updateResult.error) {
      return NextResponse.json(
        { error: jobsResult.error?.message || updateResult.error?.message || '게시 큐 등록에 실패했습니다.' },
        { status: 400 },
      );
    }

    try {
      await logContentEvent(supabase, {
        dailyContentId: id,
        eventType: 'publish_requested',
        actorEmail: email,
        detail: {
          publishRequestId,
          mode: 'manual_publish_now',
          appPlaybackUrl,
        },
      });
    } catch (eventError) {
      console.error('[publish-now route] content_events insert failed', eventError);
    }

    return NextResponse.json({ ok: true, appPlaybackUrl, workflowStatus: 'published' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '즉시 게시에 실패했습니다.' },
      { status: 401 },
    );
  }
}
