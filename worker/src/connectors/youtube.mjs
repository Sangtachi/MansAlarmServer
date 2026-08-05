import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';

import { config, isYoutubeConfigured, makeWorkDir } from '../config.mjs';

const YOUTUBE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';

function truncate(text, maxLength) {
  const value = `${text || ''}`.trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

async function refreshAccessToken() {
  const body = new URLSearchParams({
    client_id: config.youtubeClientId,
    client_secret: config.youtubeClientSecret,
    refresh_token: config.youtubeRefreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(YOUTUBE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `YouTube OAuth refresh failed: ${payload.error_description || payload.error || response.statusText}`,
    );
  }

  return payload.access_token;
}

async function downloadVideoToTemp(videoUrl) {
  const workDir = makeWorkDir('youtube-upload');
  fs.mkdirSync(workDir, { recursive: true });
  const filePath = path.join(workDir, 'upload.mp4');

  const response = await fetch(videoUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download video for YouTube upload (${response.status}).`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
  const stats = fs.statSync(filePath);
  if (!stats.size) {
    throw new Error('Downloaded video file is empty.');
  }

  return { workDir, filePath, fileSize: stats.size };
}

async function initResumableSession(accessToken, metadata, fileSize) {
  const url = `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(fileSize),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YouTube resumable init failed (${response.status}): ${errorText}`);
  }

  const uploadUrl = response.headers.get('location');
  if (!uploadUrl) {
    throw new Error('YouTube resumable init did not return an upload URL.');
  }

  return uploadUrl;
}

async function uploadVideoBytes(uploadUrl, accessToken, filePath, fileSize) {
  const fileBuffer = fs.readFileSync(filePath);
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileSize),
    },
    body: fileBuffer,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    throw new Error(
      `YouTube upload failed (${response.status}): ${payload.error?.message || JSON.stringify(payload)}`,
    );
  }

  return payload.id;
}

/**
 * Upload a public video URL to YouTube Shorts/video feed.
 * @param {{ videoUrl: string, title: string, description: string }} input
 * @returns {Promise<{ remoteId: string, remoteUrl: string }>}
 */
export async function publishToYoutube(input) {
  if (!isYoutubeConfigured()) {
    throw new Error(
      'YouTube is not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, YOUTUBE_CHANNEL_ID in worker env.',
    );
  }

  const videoUrl = `${input.videoUrl || ''}`.trim();
  if (!/^https?:\/\//i.test(videoUrl)) {
    throw new Error('YouTube upload requires a public http(s) video URL.');
  }

  const title = truncate(input.title || 'MansAlarm', 100) || 'MansAlarm';
  const description = truncate(input.description || title, 5000);
  const accessToken = await refreshAccessToken();

  let workDir = null;
  try {
    const downloaded = await downloadVideoToTemp(videoUrl);
    workDir = downloaded.workDir;

    const metadata = {
      snippet: {
        title,
        description,
        categoryId: '22',
        channelId: config.youtubeChannelId,
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
      },
    };

    const uploadUrl = await initResumableSession(accessToken, metadata, downloaded.fileSize);
    const videoId = await uploadVideoBytes(uploadUrl, accessToken, downloaded.filePath, downloaded.fileSize);

    return {
      remoteId: videoId,
      remoteUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } finally {
    if (workDir) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}
