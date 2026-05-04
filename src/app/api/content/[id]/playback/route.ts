import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { buildDrivePlaybackSource, extractDriveFileId } from '@/lib/contentStudio';
import { adminEnv, hasSupabaseEnv } from '@/lib/env';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: 'Supabase configuration is missing.' }, { status: 500 });
  }

  const { id } = await params;
  const supabase = createClient(adminEnv.supabaseUrl, adminEnv.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const contentResult = await supabase
    .from('daily_contents')
    .select('id, drive_file_id, drive_share_url, shortform_video_url')
    .eq('id', id)
    .maybeSingle<{
      id: string;
      drive_file_id: string | null;
      drive_share_url: string | null;
      shortform_video_url: string | null;
    }>();

  if (contentResult.error || !contentResult.data) {
    return NextResponse.json({ error: 'Content not found.' }, { status: 404 });
  }

  const content = contentResult.data;
  const driveFileId = extractDriveFileId(content.drive_file_id || content.drive_share_url);
  if (driveFileId) {
    return NextResponse.redirect(buildDrivePlaybackSource(driveFileId), 307);
  }

  if (content.shortform_video_url) {
    return NextResponse.redirect(content.shortform_video_url, 307);
  }

  return NextResponse.json({ error: 'Playback asset is not ready.' }, { status: 404 });
}
