import { adminEnv } from './env';
import { PublishMode, WorkflowStatus } from './types';

export const CONTENT_MEDIA_BUCKET = 'content-media';

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: '초안',
  rendering: '렌더링',
  preview_ready: '미리보기 준비',
  approved: '승인 완료',
  scheduled: '예약 대기',
  publishing: '배포 중',
  published: '배포 완료',
  failed: '실패',
};

export const PUBLISH_MODE_LABELS: Record<PublishMode, string> = {
  immediate: '즉시',
  scheduled: '예약',
};

export function buildDefaultSocialCaption(phrase: string, subPhrase: string, description: string) {
  return [phrase.trim(), subPhrase.trim(), description.trim()].filter(Boolean).join('\n');
}

export function buildStoragePublicUrl(storagePath: string | null | undefined) {
  const normalizedPath = storagePath?.trim();
  if (!normalizedPath || !adminEnv.supabaseUrl) {
    return '';
  }

  return `${adminEnv.supabaseUrl}/storage/v1/object/public/${CONTENT_MEDIA_BUCKET}/${normalizedPath}`;
}

export function inferFileExtension(fileName: string, mimeType: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.mov')) {
    return 'mov';
  }
  if (lower.endsWith('.webm')) {
    return 'webm';
  }
  if (lower.endsWith('.m4v')) {
    return 'm4v';
  }
  if (mimeType.includes('quicktime')) {
    return 'mov';
  }
  if (mimeType.includes('webm')) {
    return 'webm';
  }
  return 'mp4';
}

export function makeBackgroundUploadPath(params: { contentDate: string; contentId: string; fileName: string; mimeType: string }) {
  const extension = inferFileExtension(params.fileName, params.mimeType);
  return `backgrounds/${params.contentDate}/${params.contentId}-${Date.now()}.${extension}`;
}
