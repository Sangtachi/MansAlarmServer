import { randomUUID } from 'node:crypto';

import { isInstagramConfigured, isYoutubeConfigured } from './config.mjs';
import { publishToInstagram } from './connectors/instagram.mjs';
import { publishToYoutube } from './connectors/youtube.mjs';
import {
  buildSocialCaption,
  buildYoutubeTitle,
  resolvePublicVideoUrl,
} from './publishMedia.mjs';
import { supabase } from './supabase.mjs';

function missingCredentialsError(platform) {
  const hints = platform === 'youtube'
    ? 'Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, YOUTUBE_CHANNEL_ID in worker env.'
    : 'Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID in worker env.';
  return `${platform} credentials are missing. ${hints} For local testing, set MANSALARM_MOCK_PUBLISH_SUCCESS=1 to bypass.`;
}

async function logContentEvent(dailyContentId, eventType, detail = {}) {
  const { error } = await supabase.from('content_events').insert({
    daily_content_id: dailyContentId,
    event_type: eventType,
    actor_email: 'worker@mansalarm.local',
    detail_json: detail,
  });

  if (error) {
    console.error('[worker publish] failed to insert content_event', error.message);
  }
}

function getPlatformPatch(platform, status, errorMessage = null, remoteId = null, remoteUrl = null) {
  if (platform === 'youtube') {
    return {
      youtube_publish_status: status,
      youtube_last_error: errorMessage,
      youtube_video_id: remoteId,
      youtube_url: remoteUrl,
    };
  }

  return {
    instagram_publish_status: status,
    instagram_last_error: errorMessage,
    instagram_media_id: remoteId,
    instagram_url: remoteUrl,
  };
}

async function summarizePublishRequest(contentId, publishRequestId) {
  const jobsResult = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('publish_request_id', publishRequestId)
    .order('created_at', { ascending: true });

  if (jobsResult.error || !jobsResult.data) {
    throw new Error(jobsResult.error?.message || 'Failed to load publish jobs.');
  }

  const jobs = jobsResult.data;
  if (jobs.some((job) => ['pending', 'scheduled', 'processing'].includes(job.status))) {
    return;
  }

  const failedJobs = jobs.filter((job) => job.status === 'failed');
  if (failedJobs.length > 0) {
    await logContentEvent(contentId, 'publish_failed', {
      publishRequestId,
      failedPlatforms: failedJobs.map((job) => job.platform),
    });
    return;
  }

  await logContentEvent(contentId, 'publish_completed', {
    publishRequestId,
    platforms: jobs.map((job) => job.platform),
  });
}

async function markPublishProcessing(job) {
  const nowIso = new Date().toISOString();
  const [jobUpdateResult, contentUpdateResult] = await Promise.all([
    supabase.from('publish_jobs').update({
      status: 'processing',
      attempts: (job.attempts || 0) + 1,
      started_at: nowIso,
      error_message: null,
    }).eq('id', job.id),
    supabase.from('daily_contents').update({
      ...getPlatformPatch(job.platform, 'processing', null),
      last_error: null,
    }).eq('id', job.daily_content_id),
  ]);

  if (jobUpdateResult.error) {
    throw new Error(jobUpdateResult.error.message);
  }
  if (contentUpdateResult.error) {
    throw new Error(contentUpdateResult.error.message);
  }
}

async function markPublishFailure(job, message) {
  const nowIso = new Date().toISOString();
  const [jobUpdateResult, contentUpdateResult] = await Promise.all([
    supabase.from('publish_jobs').update({
      status: 'failed',
      finished_at: nowIso,
      error_message: message,
    }).eq('id', job.id),
    supabase.from('daily_contents').update({
      ...getPlatformPatch(job.platform, 'failed', message),
      last_error: message,
    }).eq('id', job.daily_content_id),
  ]);

  if (jobUpdateResult.error) {
    throw new Error(jobUpdateResult.error.message);
  }
  if (contentUpdateResult.error) {
    throw new Error(contentUpdateResult.error.message);
  }

  await logContentEvent(job.daily_content_id, 'publish_failed', {
    publishRequestId: job.publish_request_id,
    platform: job.platform,
    message,
  });
  await summarizePublishRequest(job.daily_content_id, job.publish_request_id);
}

async function markPublishSuccess(job, remoteId, remoteUrl) {
  const nowIso = new Date().toISOString();
  const [jobUpdateResult, contentUpdateResult] = await Promise.all([
    supabase.from('publish_jobs').update({
      status: 'completed',
      finished_at: nowIso,
      error_message: null,
      remote_id: remoteId,
      remote_url: remoteUrl,
    }).eq('id', job.id),
    supabase.from('daily_contents').update({
      ...getPlatformPatch(job.platform, 'published', null, remoteId, remoteUrl),
      last_error: null,
    }).eq('id', job.daily_content_id),
  ]);

  if (jobUpdateResult.error) {
    throw new Error(jobUpdateResult.error.message);
  }
  if (contentUpdateResult.error) {
    throw new Error(contentUpdateResult.error.message);
  }

  await summarizePublishRequest(job.daily_content_id, job.publish_request_id);
}

async function publishWithConnector(job, content) {
  const videoUrl = resolvePublicVideoUrl(content);
  if (!videoUrl) {
    throw new Error(
      'Playable public video URL is missing. Need shortform_video_url or app_playback_url (Drive-only assets are not supported for social upload).',
    );
  }

  const caption = buildSocialCaption(content);
  const title = buildYoutubeTitle(content);

  if (job.platform === 'youtube') {
    if (!isYoutubeConfigured()) {
      throw new Error(missingCredentialsError('youtube'));
    }
    return publishToYoutube({
      videoUrl,
      title,
      description: caption,
    });
  }

  if (job.platform === 'instagram') {
    if (!isInstagramConfigured()) {
      throw new Error(missingCredentialsError('instagram'));
    }
    return publishToInstagram({
      videoUrl,
      caption,
    });
  }

  throw new Error(`Unsupported publish platform: ${job.platform}`);
}

export async function enqueueScheduledPublication() {
  const nowIso = new Date().toISOString();
  const scheduledResult = await supabase
    .from('daily_contents')
    .select('id, publish_at, shortform_video_url, app_playback_url, drive_file_id, drive_share_url, workflow_status')
    .eq('workflow_status', 'scheduled')
    .not('publish_at', 'is', null)
    .lte('publish_at', nowIso)
    .order('publish_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (scheduledResult.error) {
    throw new Error(scheduledResult.error.message);
  }

  const content = scheduledResult.data;
  if (!content) {
    return false;
  }

  if (!content.shortform_video_url && !content.app_playback_url && !content.drive_file_id && !content.drive_share_url) {
    await supabase.from('daily_contents').update({
      workflow_status: 'failed',
      app_publish_status: 'failed',
      last_error: 'Scheduled content is missing a playable asset.',
    }).eq('id', content.id);

    await logContentEvent(content.id, 'publish_failed', {
      reason: 'missing_playback_asset_for_scheduled_publish',
    });
    return true;
  }

  const publishRequestId = randomUUID();
  const [jobsResult, updateResult] = await Promise.all([
    supabase.from('publish_jobs').insert([
      {
        daily_content_id: content.id,
        publish_request_id: publishRequestId,
        platform: 'youtube',
        status: 'pending',
        scheduled_for: nowIso,
        attempts: 0,
      },
      {
        daily_content_id: content.id,
        publish_request_id: publishRequestId,
        platform: 'instagram',
        status: 'pending',
        scheduled_for: nowIso,
        attempts: 0,
      },
    ]),
    supabase.from('daily_contents').update({
      workflow_status: 'published',
      app_publish_status: 'approved_live',
      active_publish_request_id: publishRequestId,
      last_error: null,
      is_published: true,
      published_at: nowIso,
      youtube_publish_status: 'pending',
      instagram_publish_status: 'pending',
      youtube_last_error: null,
      instagram_last_error: null,
    }).eq('id', content.id),
  ]);

  if (jobsResult.error || updateResult.error) {
    throw new Error(jobsResult.error?.message || updateResult.error?.message || 'Failed to enqueue scheduled publish.');
  }

  await logContentEvent(content.id, 'publish_requested', {
    publishRequestId,
    mode: 'scheduled',
    scheduledAt: content.publish_at,
  });

  return true;
}

export async function processNextPublishJob() {
  const nowIso = new Date().toISOString();
  const nextJobsResult = await supabase
    .from('publish_jobs')
    .select('*')
    .in('status', ['pending', 'scheduled'])
    .order('scheduled_for', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(20);

  if (nextJobsResult.error) {
    throw new Error(nextJobsResult.error.message);
  }

  const job = (nextJobsResult.data ?? []).find(
    (candidate) => !candidate.scheduled_for || candidate.scheduled_for <= nowIso,
  );

  if (!job) {
    return false;
  }

  await markPublishProcessing(job);

  const contentResult = await supabase
    .from('daily_contents')
    .select('id, phrase, sub_phrase, social_caption, shortform_video_url, app_playback_url, drive_file_id, drive_share_url')
    .eq('id', job.daily_content_id)
    .maybeSingle();

  if (contentResult.error || !contentResult.data) {
    await markPublishFailure(job, contentResult.error?.message || 'Daily content row is missing.');
    return true;
  }

  if (process.env.MANSALARM_MOCK_PUBLISH_SUCCESS === '1') {
    await markPublishSuccess(
      job,
      `mock-${job.platform}-${job.id}`,
      `https://example.com/${job.platform}/${job.id}`,
    );
    return true;
  }

  try {
    const result = await publishWithConnector(job, contentResult.data);
    await markPublishSuccess(job, result.remoteId, result.remoteUrl);
  } catch (error) {
    await markPublishFailure(
      job,
      error instanceof Error ? error.message : 'Social publish failed.',
    );
  }

  return true;
}
