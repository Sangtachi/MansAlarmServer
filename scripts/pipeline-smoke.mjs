import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code}\n${stderr}`));
    });
  });
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

async function findAvailableDate(supabase) {
  for (let offset = 365; offset < 365 + 60; offset += 1) {
    const candidate = new Date();
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const dateKey = toDateKey(candidate);
    const { data, error } = await supabase
      .from('daily_contents')
      .select('id')
      .eq('content_date', dateKey)
      .maybeSingle();

    if (error && !error.message.toLowerCase().includes('0 rows')) {
      throw new Error(error.message);
    }

    if (!data) {
      return dateKey;
    }
  }

  throw new Error('Could not find an empty future content_date for smoke test.');
}

async function ensureSmokeSeason(supabase, monthKey) {
  const existingResult = await supabase
    .from('content_seasons')
    .select('id')
    .eq('month_key', monthKey)
    .maybeSingle();

  if (existingResult.error && !existingResult.error.message.toLowerCase().includes('0 rows')) {
    throw new Error(existingResult.error.message);
  }

  if (existingResult.data?.id) {
    return existingResult.data.id;
  }

  const insertResult = await supabase
    .from('content_seasons')
    .insert({
      month_key: monthKey,
      title: `[SMOKE] ${monthKey} Dark War`,
      theme_family: 'dark_fantasy_war',
      season_summary: 'Local smoke test season for the shortform pipeline.',
      base_world_prompt: 'A dark fantasy battlefield with cold steel, ash, smoke, and restrained gold highlights.',
      visual_rules: '9:16 vertical, cinematic framing, no embedded text, black and gold mood, loop-friendly motion.',
      is_active: false,
    })
    .select('id')
    .single();

  if (insertResult.error || !insertResult.data) {
    throw new Error(insertResult.error?.message || 'Failed to create smoke season.');
  }

  return insertResult.data.id;
}

async function assertRequiredSchema(supabase) {
  const checks = [
    ['daily_contents', 'id'],
    ['render_jobs', 'id'],
    ['publish_jobs', 'id'],
    ['content_events', 'id'],
    ['content_seasons', 'id'],
  ];

  const missing = [];
  for (const [table, column] of checks) {
    const result = await supabase.from(table).select(column).limit(1);
    if (result.error?.message?.includes(`table 'public.${table}'`)) {
      missing.push(table);
    }
  }

  if (missing.length) {
    throw new Error(
      `Missing required Supabase tables: ${missing.join(', ')}. Apply the latest migrations, especially 20260410173000_season_drive_pipeline_v2.sql, then rerun the smoke test.`,
    );
  }
}

async function createBackgroundVideo(targetPath) {
  await run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=#111111:s=1080x1920:d=8',
    '-vf',
    "drawbox=x=80:y=220:w=920:h=1280:color=#20160a@0.85:t=fill,drawbox=x=120:y=260:w=840:h=1200:color=#3b2a12@0.28:t=fill",
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    targetPath,
  ]);
}

async function uploadBufferToStorage(supabase, bucket, storagePath, filePath, contentType) {
  const file = readFileSync(filePath);
  const result = await supabase.storage.from(bucket).upload(storagePath, file, {
    upsert: true,
    contentType,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

async function waitForRenderCompletion(processNextRenderJob, supabase, contentId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await processNextRenderJob();
    const result = await supabase
      .from('daily_contents')
      .select('workflow_status, shortform_video_url, poster_asset_path, last_error')
      .eq('id', contentId)
      .single();

    if (result.error || !result.data) {
      throw new Error(result.error?.message || 'Smoke content disappeared during render.');
    }

    if (result.data.workflow_status === 'preview_ready' && result.data.shortform_video_url) {
      return result.data;
    }

    if (result.data.workflow_status === 'failed') {
      throw new Error(result.data.last_error || 'Render failed.');
    }
  }

  throw new Error('Render did not finish within the expected number of attempts.');
}

async function approveAndPublishMock(supabase, contentId, shortformVideoUrl) {
  const nowIso = new Date().toISOString();
  const publishRequestId = randomUUID();

  const [jobsResult, updateResult] = await Promise.all([
    supabase.from('publish_jobs').insert([
      {
        daily_content_id: contentId,
        publish_request_id: publishRequestId,
        platform: 'youtube',
        status: 'pending',
        scheduled_for: nowIso,
        attempts: 0,
      },
      {
        daily_content_id: contentId,
        publish_request_id: publishRequestId,
        platform: 'instagram',
        status: 'pending',
        scheduled_for: nowIso,
        attempts: 0,
      },
    ]),
    supabase.from('daily_contents').update({
      app_playback_url: shortformVideoUrl,
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
    }).eq('id', contentId),
  ]);

  if (jobsResult.error || updateResult.error) {
    throw new Error(jobsResult.error?.message || updateResult.error?.message || 'Failed to enqueue mock publish.');
  }

  return publishRequestId;
}

async function waitForMockPublish(processNextPublishJob, supabase, contentId) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await processNextPublishJob();
    const result = await supabase
      .from('daily_contents')
      .select('app_publish_status, youtube_publish_status, instagram_publish_status, youtube_url, instagram_url, last_error')
      .eq('id', contentId)
      .single();

    if (result.error || !result.data) {
      throw new Error(result.error?.message || 'Smoke content disappeared during publish.');
    }

    if (
      result.data.app_publish_status === 'approved_live'
      && result.data.youtube_publish_status === 'published'
      && result.data.instagram_publish_status === 'published'
    ) {
      return result.data;
    }

    if (result.data.youtube_publish_status === 'failed' || result.data.instagram_publish_status === 'failed') {
      throw new Error(result.data.last_error || 'Mock publish failed.');
    }
  }

  throw new Error('Mock publish did not finish within the expected number of attempts.');
}

async function main() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  loadEnvFile(path.join(repoRoot, '.env.local'));
  process.env.MANSALARM_MOCK_PUBLISH_SUCCESS = process.env.MANSALARM_MOCK_PUBLISH_SUCCESS || '1';

  if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const [{ createClient }, { processNextRenderJob }, publishModule, { config }] = await Promise.all([
    import('@supabase/supabase-js'),
    import('../worker/src/render.mjs'),
    import('../worker/src/publish.mjs'),
    import('../worker/src/config.mjs'),
  ]);

  const { processNextPublishJob } = publishModule;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  await assertRequiredSchema(supabase);

  const dateKey = await findAvailableDate(supabase);
  const monthKey = dateKey.slice(0, 7);
  const seasonId = await ensureSmokeSeason(supabase, monthKey);
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'mansalarm-smoke-'));
  const backgroundPath = path.join(workDir, 'background.mp4');
  const storagePath = `backgrounds/${dateKey}/smoke-${Date.now()}.mp4`;

  try {
    await mkdir(workDir, { recursive: true });
    await createBackgroundVideo(backgroundPath);
    await uploadBufferToStorage(supabase, config.bucket, storagePath, backgroundPath, 'video/mp4');

    const insertResult = await supabase
      .from('daily_contents')
      .insert({
        content_date: dateKey,
        season_id: seasonId,
        archetype: 'knight',
        generator_provider: 'veo',
        generation_prompt_draft: 'Smoke pipeline draft prompt.',
        generation_prompt_final: 'Smoke pipeline final prompt.',
        phrase: '행증자명',
        sub_phrase: '行證自明',
        description: '행동이 스스로를 증명한다. 말이 아니라 행동이 결과로 자신을 증명한다.',
        reward_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        social_caption: '[SMOKE] MansAlarm pipeline validation content.',
        background_asset_path: storagePath,
        publish_mode: 'immediate',
        workflow_status: 'draft',
        app_publish_status: 'draft',
        is_published: false,
      })
      .select('id')
      .single();

    if (insertResult.error || !insertResult.data) {
      throw new Error(insertResult.error?.message || 'Failed to create smoke content row.');
    }

    const contentId = insertResult.data.id;
    const renderInsert = await supabase.from('render_jobs').insert({
      daily_content_id: contentId,
      status: 'pending',
      attempts: 0,
    });

    if (renderInsert.error) {
      throw new Error(renderInsert.error.message);
    }

    const renderResult = await waitForRenderCompletion(processNextRenderJob, supabase, contentId);
    await approveAndPublishMock(supabase, contentId, renderResult.shortform_video_url);
    const publishResult = await waitForMockPublish(processNextPublishJob, supabase, contentId);

    const eventsResult = await supabase
      .from('content_events')
      .select('event_type, created_at')
      .eq('daily_content_id', contentId)
      .order('created_at', { ascending: true });

    if (eventsResult.error) {
      throw new Error(eventsResult.error.message);
    }

    console.log(JSON.stringify({
      ok: true,
      mode: 'mock_social_publish',
      contentId,
      contentDate: dateKey,
      seasonId,
      shortformVideoUrl: renderResult.shortform_video_url,
      posterAssetPath: renderResult.poster_asset_path,
      appPublishStatus: publishResult.app_publish_status,
      youtubePublishStatus: publishResult.youtube_publish_status,
      instagramPublishStatus: publishResult.instagram_publish_status,
      youtubeUrl: publishResult.youtube_url,
      instagramUrl: publishResult.instagram_url,
      events: eventsResult.data?.map((event) => event.event_type) ?? [],
    }, null, 2));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[smoke:pipeline]', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
