import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AppPublishStatus,
  ContentEventType,
  DailyContentRow,
  PublishPlatform,
  PlatformPublishStatus,
} from './types';

export const CONTENT_EVENT_LABELS: Record<ContentEventType, string> = {
  content_created: '생성',
  content_updated: '수정',
  background_uploaded: '배경 업로드',
  render_requested: '렌더 요청',
  render_completed: '렌더 완료',
  render_failed: '렌더 실패',
  approved: '승인',
  scheduled: '예약 대기',
  publish_requested: '게시 요청',
  publish_completed: '게시 완료',
  publish_failed: '게시 실패',
  retry_requested: '재시도 요청',
};

export const APP_PUBLISH_STATUS_LABELS: Record<AppPublishStatus, string> = {
  draft: '앱 미게시',
  approved_live: '앱 공개중',
  failed: '앱 실패',
};

export const PLATFORM_PUBLISH_STATUS_LABELS: Record<PlatformPublishStatus, string> = {
  pending: '대기',
  processing: '처리중',
  published: '게시완료',
  failed: '실패',
};

export function isPublishedLocked(row: Pick<
  DailyContentRow,
  'is_published' | 'workflow_status' | 'app_publish_status'
>) {
  return row.is_published || row.workflow_status === 'published' || row.app_publish_status === 'approved_live';
}

export function hasPreviewAsset(row: Pick<DailyContentRow, 'app_playback_url' | 'shortform_video_url'>) {
  return Boolean(row.app_playback_url || row.shortform_video_url);
}

export function canRequestRender(row: Pick<DailyContentRow, 'background_asset_path' | 'workflow_status' | 'is_published'>) {
  if (!row.background_asset_path || row.is_published) {
    return false;
  }

  return ['draft', 'failed', 'preview_ready', 'approved', 'scheduled'].includes(row.workflow_status);
}

export function canApproveContent(row: Pick<
  DailyContentRow,
  'app_playback_url' | 'shortform_video_url' | 'workflow_status' | 'app_publish_status'
>) {
  if (row.app_publish_status === 'approved_live') {
    return false;
  }

  return hasPreviewAsset(row) && ['draft', 'preview_ready', 'approved', 'scheduled', 'failed'].includes(row.workflow_status);
}

export function canResolveDriveAsset(row: Pick<DailyContentRow, 'drive_file_id' | 'drive_share_url' | 'app_publish_status' | 'workflow_status'>) {
  if (row.app_publish_status === 'approved_live' || row.workflow_status === 'published') {
    return false;
  }

  return Boolean(row.drive_file_id || row.drive_share_url);
}

export function canApproveAndPublish(row: Pick<
  DailyContentRow,
  'app_playback_url' | 'shortform_video_url' | 'workflow_status' | 'app_publish_status'
>) {
  if (row.app_publish_status === 'approved_live') {
    return false;
  }

  return hasPreviewAsset(row) && ['preview_ready', 'approved', 'scheduled', 'failed', 'draft'].includes(row.workflow_status);
}

export function canRetryPlatform(
  row: Pick<DailyContentRow, 'app_publish_status' | 'youtube_publish_status' | 'instagram_publish_status'>,
  platform: PublishPlatform,
) {
  if (row.app_publish_status !== 'approved_live') {
    return false;
  }

  return platform === 'youtube'
    ? row.youtube_publish_status === 'failed'
    : row.instagram_publish_status === 'failed';
}

export function canPublishNow(row: Pick<
  DailyContentRow,
  'app_playback_url' | 'shortform_video_url' | 'workflow_status' | 'app_publish_status'
>) {
  if (row.app_publish_status === 'approved_live') {
    return false;
  }

  return hasPreviewAsset(row) && ['approved', 'scheduled', 'failed'].includes(row.workflow_status);
}

export function canRetryRender(row: Pick<DailyContentRow, 'background_asset_path' | 'workflow_status'>) {
  return Boolean(row.background_asset_path) && row.workflow_status === 'failed';
}

export function canRetryPublish(row: Pick<DailyContentRow, 'shortform_video_url' | 'workflow_status'>) {
  return Boolean(row.shortform_video_url) && row.workflow_status === 'failed';
}

export function validateRenderRequest(row: Pick<DailyContentRow, 'background_asset_path' | 'workflow_status' | 'is_published'>) {
  if (!row.background_asset_path) {
    return '배경 영상을 먼저 업로드해야 합니다.';
  }
  if (row.is_published) {
    return '이미 게시된 콘텐츠는 새 초안으로 복제해서 다시 렌더해야 합니다.';
  }
  if (!canRequestRender(row)) {
    return '현재 상태에서는 렌더를 다시 요청할 수 없습니다.';
  }
  return null;
}

export function validateApproveRequest(row: Pick<
  DailyContentRow,
  'app_playback_url' | 'shortform_video_url' | 'workflow_status' | 'app_publish_status'
>) {
  if (!hasPreviewAsset(row)) {
    return '앱용 재생 URL 또는 렌더된 숏폼이 먼저 필요합니다.';
  }
  if (!canApproveContent(row)) {
    return '현재 상태에서는 승인할 수 없습니다.';
  }
  return null;
}

export function validateResolveDriveAssetRequest(row: Pick<
  DailyContentRow,
  'drive_file_id' | 'drive_share_url' | 'app_publish_status' | 'workflow_status'
>) {
  if (!row.drive_file_id && !row.drive_share_url) {
    return 'Google Drive 파일 ID 또는 공유 URL이 필요합니다.';
  }
  if (!canResolveDriveAsset(row)) {
    return '현재 상태에서는 Drive 에셋을 다시 해석할 수 없습니다.';
  }
  return null;
}

export function validateApproveAndPublishRequest(row: Pick<
  DailyContentRow,
  'app_playback_url' | 'shortform_video_url' | 'workflow_status' | 'app_publish_status'
>) {
  if (!hasPreviewAsset(row)) {
    return '앱용 재생 URL 또는 렌더된 숏폼이 먼저 필요합니다.';
  }
  if (!canApproveAndPublish(row)) {
    return '현재 상태에서는 승인 및 게시를 시작할 수 없습니다.';
  }
  return null;
}

export function validatePublishNowRequest(row: Pick<
  DailyContentRow,
  'app_playback_url' | 'shortform_video_url' | 'workflow_status' | 'app_publish_status'
>) {
  if (!hasPreviewAsset(row)) {
    return '앱용 재생 URL 또는 렌더된 숏폼이 먼저 필요합니다.';
  }
  if (!canPublishNow(row)) {
    return '승인 완료, 예약 대기, 또는 실패 상태에서만 즉시 게시할 수 있습니다.';
  }
  return null;
}

export function validateRetryRenderRequest(row: Pick<DailyContentRow, 'background_asset_path' | 'workflow_status'>) {
  if (!canRetryRender(row)) {
    return '렌더 실패 상태에서만 렌더 재시도를 요청할 수 있습니다.';
  }
  return null;
}

export function validateRetryPublishRequest(row: Pick<DailyContentRow, 'shortform_video_url' | 'workflow_status'>) {
  if (!canRetryPublish(row)) {
    return '게시 실패 상태에서만 게시 재시도를 요청할 수 있습니다.';
  }
  return null;
}

export function validateRetryPlatformRequest(
  row: Pick<DailyContentRow, 'app_publish_status' | 'youtube_publish_status' | 'instagram_publish_status'>,
  platform: PublishPlatform,
) {
  if (!canRetryPlatform(row, platform)) {
    return platform === 'youtube'
      ? 'YouTube 실패 상태에서만 재시도할 수 있습니다.'
      : 'Instagram 실패 상태에서만 재시도할 수 있습니다.';
  }
  return null;
}

export async function logContentEvent(
  supabase: SupabaseClient,
  {
    dailyContentId,
    eventType,
    actorEmail,
    detail,
  }: {
    dailyContentId: string;
    eventType: ContentEventType;
    actorEmail?: string | null;
    detail?: Record<string, unknown> | null;
  }
) {
  const { error } = await supabase.from('content_events').insert({
    daily_content_id: dailyContentId,
    event_type: eventType,
    actor_email: actorEmail ?? null,
    detail_json: detail ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }
}
