import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { logContentEvent, validateRetryPlatformRequest } from '@/lib/contentOperations';
import { getAdminRouteContext } from '@/lib/serverAuth';
import { DailyContentRow, PublishPlatform } from '@/lib/types';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email } = await getAdminRouteContext(request);
    const { id } = await params;
    const platform = request.nextUrl.searchParams.get('platform') as PublishPlatform | null;

    if (platform !== 'youtube' && platform !== 'instagram') {
      return NextResponse.json({ error: 'platform은 youtube 또는 instagram 이어야 합니다.' }, { status: 400 });
    }

    const contentResult = await supabase
      .from('daily_contents')
      .select('id, app_publish_status, youtube_publish_status, instagram_publish_status')
      .eq('id', id)
      .maybeSingle<Pick<
        DailyContentRow,
        'id' | 'app_publish_status' | 'youtube_publish_status' | 'instagram_publish_status'
      >>();

    if (contentResult.error || !contentResult.data) {
      return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 });
    }

    const validationError = validateRetryPlatformRequest(contentResult.data, platform);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const publishRequestId = randomUUID();
    const nowIso = new Date().toISOString();
    const jobResult = await supabase.from('publish_jobs').insert({
      daily_content_id: id,
      publish_request_id: publishRequestId,
      platform,
      status: 'pending',
      scheduled_for: nowIso,
      attempts: 0,
    });

    if (jobResult.error) {
      return NextResponse.json({ error: jobResult.error.message }, { status: 400 });
    }

    const statusPatch =
      platform === 'youtube'
        ? { youtube_publish_status: 'pending', youtube_last_error: null }
        : { instagram_publish_status: 'pending', instagram_last_error: null };

    const updateResult = await supabase
      .from('daily_contents')
      .update(statusPatch)
      .eq('id', id);

    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 400 });
    }

    try {
      await logContentEvent(supabase, {
        dailyContentId: id,
        eventType: 'retry_requested',
        actorEmail: email,
        detail: {
          target: platform,
          publishRequestId,
        },
      });
    } catch (eventError) {
      console.error('[retry-platform route] content_events insert failed', eventError);
    }

    return NextResponse.json({
      ok: true,
      platform,
      publishRequestId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '플랫폼 재시도 등록에 실패했습니다.' },
      { status: 401 },
    );
  }
}
