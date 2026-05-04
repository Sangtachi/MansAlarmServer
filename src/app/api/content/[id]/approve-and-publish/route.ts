import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { logContentEvent, validateApproveAndPublishRequest } from '@/lib/contentOperations';
import { getAdminRouteContext } from '@/lib/serverAuth';
import { DailyContentRow } from '@/lib/types';

async function createPlatformJobs(
  id: string,
  publishRequestId: string,
  nowIso: string,
  supabase: Awaited<ReturnType<typeof getAdminRouteContext>>['supabase'],
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

    const contentResult = await supabase
      .from('daily_contents')
      .select('id, app_playback_url, shortform_video_url, workflow_status, app_publish_status')
      .eq('id', id)
      .maybeSingle<Pick<
        DailyContentRow,
        'id' | 'app_playback_url' | 'shortform_video_url' | 'workflow_status' | 'app_publish_status'
      >>();

    if (contentResult.error || !contentResult.data) {
      return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 });
    }

    const validationError = validateApproveAndPublishRequest(contentResult.data);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const appPlaybackUrl = contentResult.data.app_playback_url || contentResult.data.shortform_video_url;

    const [jobsResult, updateResult] = await Promise.all([
      createPlatformJobs(id, publishRequestId, nowIso, supabase),
      supabase
        .from('daily_contents')
        .update({
          app_playback_url: appPlaybackUrl,
          app_publish_status: 'approved_live',
          workflow_status: 'published',
          approved_at: nowIso,
          published_at: nowIso,
          is_published: true,
          active_publish_request_id: publishRequestId,
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
        { error: jobsResult.error?.message || updateResult.error?.message || '승인 및 게시에 실패했습니다.' },
        { status: 400 },
      );
    }

    try {
      await logContentEvent(supabase, {
        dailyContentId: id,
        eventType: 'approved',
        actorEmail: email,
        detail: {
          appPlaybackUrl,
          publishRequestId,
        },
      });
      await logContentEvent(supabase, {
        dailyContentId: id,
        eventType: 'publish_requested',
        actorEmail: email,
        detail: {
          publishRequestId,
          mode: 'approve_and_publish',
          platforms: ['youtube', 'instagram'],
        },
      });
    } catch (eventError) {
      console.error('[approve-and-publish route] content_events insert failed', eventError);
    }

    return NextResponse.json({
      ok: true,
      appPlaybackUrl,
      appPublishStatus: 'approved_live',
      workflowStatus: 'published',
      publishRequestId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '승인 및 게시 처리에 실패했습니다.' },
      { status: 401 },
    );
  }
}
