import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { logContentEvent, validateRetryPublishRequest } from '@/lib/contentOperations';
import { getAdminRouteContext } from '@/lib/serverAuth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email } = await getAdminRouteContext(request);
    const { id } = await params;
    const nowIso = new Date().toISOString();
    const publishRequestId = randomUUID();

    const content = await supabase
      .from('daily_contents')
      .select('id, workflow_status, shortform_video_url')
      .eq('id', id)
      .maybeSingle();

    if (content.error || !content.data) {
      return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 });
    }

    const validationError = validateRetryPublishRequest(content.data);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const [jobsResult, updateResult] = await Promise.all([
      supabase.from('publish_jobs').insert([
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
      ]),
      supabase.from('daily_contents').update({
        workflow_status: 'publishing',
        active_publish_request_id: publishRequestId,
        is_published: false,
        published_at: null,
        last_error: null,
      }).eq('id', id),
    ]);

    if (jobsResult.error || updateResult.error) {
      return NextResponse.json(
        { error: jobsResult.error?.message || updateResult.error?.message || '게시 재시도 등록에 실패했습니다.' },
        { status: 400 },
      );
    }

    try {
      await logContentEvent(supabase, {
        dailyContentId: id,
        eventType: 'retry_requested',
        actorEmail: email,
        detail: {
          target: 'publish',
          publishRequestId,
        },
      });
    } catch (eventError) {
      console.error('[retry-publish route] content_events insert failed', eventError);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '게시 재시도 등록에 실패했습니다.' },
      { status: 401 },
    );
  }
}
