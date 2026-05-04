import fs from 'fs';
import os from 'os';
import path from 'path';

function resolveFontFile() {
  const candidates = [
    process.env.FFMPEG_FONT_FILE?.trim(),
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
  ].filter(Boolean);

  const matched = candidates.find((candidate) => fs.existsSync(candidate));
  return matched || candidates[candidates.length - 1] || '';
}

export const config = {
  supabaseUrl: process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '',
  bucket: process.env.CONTENT_MEDIA_BUCKET?.trim() || 'content-media',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || '12000'),
  ffmpegFontFile: resolveFontFile(),
  tmpRoot: process.env.TMPDIR || os.tmpdir(),
};

export function buildPublicUrl(storagePath) {
  return `${config.supabaseUrl}/storage/v1/object/public/${config.bucket}/${storagePath}`;
}

export function renderOutputPaths(content) {
  const dateKey = content.content_date;
  const stamp = Date.now();
  return {
    videoPath: `renders/${dateKey}/${content.id}/shortform-${stamp}.mp4`,
    posterPath: `posters/${dateKey}/${content.id}/poster-${stamp}.jpg`,
  };
}

export function wrapText(text, maxLineLength) {
  const words = `${text || ''}`.trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLineLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.join('\n');
}

export function makeWorkDir(prefix) {
  return path.join(config.tmpRoot, `${prefix}-${Date.now()}`);
}
