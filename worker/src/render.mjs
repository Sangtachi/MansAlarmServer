import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

import { buildPublicUrl, config, renderOutputPaths, wrapText } from './config.mjs';
import { supabase } from './supabase.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function runCollect(command, args) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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

async function downloadFile(url, targetPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download background asset: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
}

async function uploadFile(storagePath, localPath, contentType) {
  const buffer = await fs.readFile(localPath);
  const result = await supabase.storage.from(config.bucket).upload(storagePath, buffer, {
    upsert: true,
    contentType,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

let drawtextSupportPromise;

async function hasDrawtextSupport() {
  if (!drawtextSupportPromise) {
    drawtextSupportPromise = runCollect('ffmpeg', ['-filters'])
      .then(({ stdout, stderr }) => `${stdout}\n${stderr}`.includes('drawtext'))
      .catch(() => false);
  }
  return drawtextSupportPromise;
}

async function renderOverlayImage({ overlayPath, phrasePath, subPhrasePath, descriptionPath }) {
  const pythonScript = `
from PIL import Image, ImageDraw, ImageFont
import sys
from pathlib import Path

overlay_path, font_path, phrase_path, sub_phrase_path, description_path = sys.argv[1:6]

def read(path):
    return Path(path).read_text(encoding='utf-8').strip()

phrase = read(phrase_path)
sub_phrase = read(sub_phrase_path)
description = read(description_path)

img = Image.new('RGBA', (1080, 1920), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

phrase_font = ImageFont.truetype(font_path, 88)
sub_font = ImageFont.truetype(font_path, 48)
desc_font = ImageFont.truetype(font_path, 42)

def draw_centered_text(text, font, top, fill, shadow_fill=(0,0,0,180), shadow_offset=(0,4), spacing=10):
    if not text:
        return top
    bbox = draw.multiline_textbbox((0, 0), text, font=font, align='center', spacing=spacing)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    x = (1080 - width) / 2
    y = top
    sx, sy = shadow_offset
    draw.multiline_text((x + sx, y + sy), text, font=font, fill=shadow_fill, align='center', spacing=spacing)
    draw.multiline_text((x, y), text, font=font, fill=fill, align='center', spacing=spacing)
    return y + height

draw_centered_text(phrase, phrase_font, 420, (255,255,255,255))
draw_centered_text(sub_phrase, sub_font, 548, (255,255,255,235), shadow_offset=(0,3), spacing=8)
draw_centered_text(description, desc_font, 646, (255,255,255,230), shadow_offset=(0,3), spacing=14)

img.save(overlay_path)
`;

  await run('python3', [
    '-c',
    pythonScript,
    overlayPath,
    config.ffmpegFontFile,
    phrasePath,
    subPhrasePath,
    descriptionPath,
  ]);
}

async function logContentEvent(dailyContentId, eventType, detail = {}) {
  const { error } = await supabase.from('content_events').insert({
    daily_content_id: dailyContentId,
    event_type: eventType,
    actor_email: 'worker@mansalarm.local',
    detail_json: detail,
  });

  if (error) {
    console.error('[worker render] failed to insert content_event', error.message);
  }
}

async function markRenderFailure(jobId, contentId, message) {
  await Promise.all([
    supabase.from('render_jobs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: message,
    }).eq('id', jobId),
    supabase.from('daily_contents').update({
      workflow_status: 'failed',
      last_error: message,
    }).eq('id', contentId),
  ]);

  await logContentEvent(contentId, 'render_failed', {
    jobId,
    error: message,
  });
}

export async function processNextRenderJob() {
  const nextJobResult = await supabase
    .from('render_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextJobResult.error) {
    throw new Error(nextJobResult.error.message);
  }

  const job = nextJobResult.data;
  if (!job) {
    return false;
  }

  const startedAt = new Date().toISOString();
  await supabase.from('render_jobs').update({
    status: 'processing',
    attempts: (job.attempts || 0) + 1,
    started_at: startedAt,
    error_message: null,
  }).eq('id', job.id);

  const contentResult = await supabase
    .from('daily_contents')
    .select('id, content_date, phrase, sub_phrase, description, background_asset_path')
    .eq('id', job.daily_content_id)
    .maybeSingle();

  if (contentResult.error || !contentResult.data) {
    await markRenderFailure(job.id, job.daily_content_id, 'Content row missing for render job.');
    return true;
  }

  const content = contentResult.data;
  if (!content.background_asset_path) {
    await markRenderFailure(job.id, content.id, 'Background asset path is missing.');
    return true;
  }

  const workDir = path.join(config.tmpRoot, `mansalarm-render-${content.id}-${Date.now()}`);
  await fs.mkdir(workDir, { recursive: true });

  const backgroundPath = path.join(workDir, 'background.mp4');
  const phrasePath = path.join(workDir, 'phrase.txt');
  const subPhrasePath = path.join(workDir, 'sub_phrase.txt');
  const descriptionPath = path.join(workDir, 'description.txt');
  const outputPath = path.join(workDir, 'output.mp4');
  const posterPath = path.join(workDir, 'poster.jpg');
  const overlayPath = path.join(workDir, 'overlay.png');

  try {
    await downloadFile(buildPublicUrl(content.background_asset_path), backgroundPath);
    await fs.writeFile(phrasePath, content.phrase.trim());
    await fs.writeFile(subPhrasePath, (content.sub_phrase || '').trim());
    await fs.writeFile(descriptionPath, wrapText(content.description, 20));

    const baseFilter = [
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      'drawbox=x=0:y=0:w=iw:h=ih:color=black@0.26:t=fill',
      'drawbox=x=0:y=0:w=iw:h=660:color=black@0.18:t=fill',
      'drawbox=x=0:y=980:w=iw:h=940:color=black@0.28:t=fill',
    ];

    if (await hasDrawtextSupport()) {
      const filter = [
        ...baseFilter,
        `drawtext=fontfile='${config.ffmpegFontFile}':textfile='${phrasePath}':fontcolor=white:fontsize=88:x=(w-text_w)/2:y=420:shadowcolor=black@0.72:shadowx=0:shadowy=4`,
        `drawtext=fontfile='${config.ffmpegFontFile}':textfile='${subPhrasePath}':fontcolor=white@0.92:fontsize=48:x=(w-text_w)/2:y=548:shadowcolor=black@0.72:shadowx=0:shadowy=3`,
        `drawtext=fontfile='${config.ffmpegFontFile}':textfile='${descriptionPath}':fontcolor=white@0.9:fontsize=42:line_spacing=14:x=(w-text_w)/2:y=646:shadowcolor=black@0.72:shadowx=0:shadowy=3`,
      ].join(',');

      await run('ffmpeg', [
        '-y',
        '-i',
        backgroundPath,
        '-vf',
        filter,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputPath,
      ]);
    } else {
      await renderOverlayImage({ overlayPath, phrasePath, subPhrasePath, descriptionPath });

      await run('ffmpeg', [
        '-y',
        '-i',
        backgroundPath,
        '-i',
        overlayPath,
        '-filter_complex',
        `[0:v]${baseFilter.join(',')}[bg];[bg][1:v]overlay=0:0`,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputPath,
      ]);
    }

    await run('ffmpeg', [
      '-y',
      '-ss',
      '00:00:00.700',
      '-i',
      outputPath,
      '-update',
      '1',
      '-vframes',
      '1',
      posterPath,
    ]);

    const outputStorage = renderOutputPaths(content);
    await uploadFile(outputStorage.videoPath, outputPath, 'video/mp4');
    await uploadFile(outputStorage.posterPath, posterPath, 'image/jpeg');

    await Promise.all([
      supabase.from('daily_contents').update({
        shortform_video_url: buildPublicUrl(outputStorage.videoPath),
        poster_asset_path: outputStorage.posterPath,
        workflow_status: 'preview_ready',
        last_error: null,
      }).eq('id', content.id),
      supabase.from('render_jobs').update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        error_message: null,
      }).eq('id', job.id),
    ]);

    await logContentEvent(content.id, 'render_completed', {
      jobId: job.id,
      shortformVideoUrl: buildPublicUrl(outputStorage.videoPath),
      posterAssetPath: outputStorage.posterPath,
    });
  } catch (error) {
    await markRenderFailure(job.id, content.id, error instanceof Error ? error.message : 'Unknown render error');
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }

  return true;
}
