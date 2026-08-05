import { config, isInstagramConfigured } from '../config.mjs';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 36; // ~3 minutes

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(text, maxLength) {
  const value = `${text || ''}`.trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

async function graphRequest(pathname, { method = 'GET', searchParams, body } = {}) {
  const url = new URL(`${GRAPH_BASE}${pathname}`);
  url.searchParams.set('access_token', config.instagramAccessToken);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const message = payload.error?.message || response.statusText || 'Unknown Graph API error';
    throw new Error(`Instagram Graph API error: ${message}`);
  }

  return payload;
}

async function createReelsContainer({ videoUrl, caption }) {
  // Instagram Graph prefers form fields for media creation; use query params for reliability.
  return graphRequest(`/${config.instagramBusinessId}/media`, {
    method: 'POST',
    searchParams: {
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: 'true',
    },
  });
}

async function waitForContainerReady(creationId) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const status = await graphRequest(`/${creationId}`, {
      searchParams: {
        fields: 'status_code,status',
      },
    });

    const code = `${status.status_code || ''}`.toUpperCase();
    if (code === 'FINISHED') {
      return status;
    }
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(`Instagram Reels container failed: ${status.status || code}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error('Instagram Reels container timed out while processing.');
}

async function publishContainer(creationId) {
  return graphRequest(`/${config.instagramBusinessId}/media_publish`, {
    method: 'POST',
    searchParams: {
      creation_id: creationId,
    },
  });
}

async function fetchPermalink(mediaId) {
  try {
    const payload = await graphRequest(`/${mediaId}`, {
      searchParams: {
        fields: 'permalink,shortcode',
      },
    });
    return payload.permalink || (payload.shortcode ? `https://www.instagram.com/reel/${payload.shortcode}/` : null);
  } catch {
    return null;
  }
}

/**
 * Publish a public video URL as an Instagram Reel.
 * Requires a publicly reachable HTTPS video URL (e.g. Supabase shortform_video_url).
 * @param {{ videoUrl: string, caption: string }} input
 * @returns {Promise<{ remoteId: string, remoteUrl: string }>}
 */
export async function publishToInstagram(input) {
  if (!isInstagramConfigured()) {
    throw new Error(
      'Instagram is not configured. Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID in worker env.',
    );
  }

  const videoUrl = `${input.videoUrl || ''}`.trim();
  if (!/^https:\/\//i.test(videoUrl)) {
    throw new Error('Instagram Reels require a public https video URL (shortform_video_url preferred).');
  }

  const caption = truncate(input.caption || '', 2200);
  const container = await createReelsContainer({ videoUrl, caption });
  const creationId = container.id;
  if (!creationId) {
    throw new Error('Instagram did not return a media container id.');
  }

  await waitForContainerReady(creationId);
  const published = await publishContainer(creationId);
  const mediaId = published.id;
  if (!mediaId) {
    throw new Error('Instagram media_publish did not return a media id.');
  }

  const permalink = await fetchPermalink(mediaId);
  return {
    remoteId: mediaId,
    remoteUrl: permalink || `https://www.instagram.com/reel/${mediaId}/`,
  };
}
