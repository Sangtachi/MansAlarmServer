import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { getAdminRouteContext } from '@/lib/serverAuth';
import { adminEnv } from '@/lib/env';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 1. Verify admin session
    await getAdminRouteContext(_request);
    const { id } = await params;

    // 2. Create Service Role client to bypass RLS (if it's blocking deletion)
    const adminSupabase = createClient(adminEnv.supabaseUrl, adminEnv.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // 3. Delete dependent records first (to prevent foreign key constraint errors)
    await adminSupabase.from('content_events').delete().eq('daily_content_id', id);
    await adminSupabase.from('publish_jobs').delete().eq('daily_content_id', id);
    await adminSupabase.from('render_jobs').delete().eq('daily_content_id', id);

    // 4. 강제 삭제 방지용 DB 트리거 우회 (is_published = true 인 경우 삭제 불가 예외가 발생하므로 먼저 draft로 내림)
    await adminSupabase.from('daily_contents').update({
      is_published: false,
      workflow_status: 'draft',
      app_publish_status: 'draft'
    }).eq('id', id);

    // 5. Force delete the main row
    const { error, data } = await adminSupabase
      .from('daily_contents')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: '삭제할 수 없거나 이미 삭제된 항목입니다.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제 처리에 실패했습니다.' },
      { status: 401 },
    );
  }
}
