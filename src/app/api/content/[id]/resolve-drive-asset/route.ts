import { NextRequest, NextResponse } from 'next/server';

import {
  buildAppPlaybackRoute,
  buildDrivePlaybackSource,
  extractDriveFileId,
  normalizeDriveShareUrl,
} from '@/lib/contentStudio';
import { logContentEvent, validateResolveDriveAssetRequest } from '@/lib/contentOperations';
import { getAdminRouteContext } from '@/lib/serverAuth';
import { DailyContentRow } from '@/lib/types';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email } = await getAdminRouteContext(request);
    const { id } = await params;

    const contentResult = await supabase
      .from('daily_contents')
      .select('id, drive_file_id, drive_share_url, app_publish_status, workflow_status')
      .eq('id', id)
      .maybeSingle<Pick<
        DailyContentRow,
        'id' | 'drive_file_id' | 'drive_share_url' | 'app_publish_status' | 'workflow_status'
      >>();

    if (contentResult.error || !contentResult.data) {
      return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 });
    }

    const validationError = validateResolveDriveAssetRequest(contentResult.data);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const normalizedShareUrl = normalizeDriveShareUrl(
      contentResult.data.drive_share_url || contentResult.data.drive_file_id,
    );
    const driveFileId = extractDriveFileId(contentResult.data.drive_file_id || contentResult.data.drive_share_url);

    if (!normalizedShareUrl || !driveFileId) {
      return NextResponse.json({ error: '유효한 Google Drive 파일 ID 또는 공유 URL이 아닙니다.' }, { status: 400 });
    }

    const appPlaybackUrl = buildAppPlaybackRoute(request.nextUrl.origin, id);
    const nextWorkflowStatus =
      contentResult.data.workflow_status === 'published'
      || contentResult.data.workflow_status === 'approved'
      || contentResult.data.workflow_status === 'scheduled'
        ? contentResult.data.workflow_status
        : 'preview_ready';

    const updateResult = await supabase
      .from('daily_contents')
      .update({
        drive_file_id: driveFileId,
        drive_share_url: normalizedShareUrl,
        app_playback_url: appPlaybackUrl,
        workflow_status: nextWorkflowStatus,
        last_error: null,
      })
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
          target: 'drive_asset',
          driveFileId,
          appPlaybackUrl,
        },
      });
    } catch (eventError) {
      console.error('[resolve-drive-asset route] content_events insert failed', eventError);
    }

    return NextResponse.json({
      ok: true,
      driveFileId,
      driveShareUrl: normalizedShareUrl,
      appPlaybackUrl,
      previewSource: buildDrivePlaybackSource(driveFileId),
      workflowStatus: nextWorkflowStatus,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Drive 에셋 해석에 실패했습니다.' },
      { status: 401 },
    );
  }
}
