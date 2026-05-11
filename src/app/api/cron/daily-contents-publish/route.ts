import { NextRequest, NextResponse } from 'next/server';

import { getKstTodayYmd } from '@/lib/contentGenerator';
import { requireCronSecret } from '@/lib/cronSecretAuth';
import { getServiceRoleSupabase } from '@/lib/supabaseServiceRole';

export const dynamic = 'force-dynamic';

async function runPublish() {
  const supabase = getServiceRoleSupabase();
  const today = getKstTodayYmd();

  const { data: existing, error: selectError } = await supabase
    .from('daily_contents')
    .select('id, content_date, is_published, approved_at')
    .eq('content_date', today)
    .maybeSingle();

  if (selectError) {
    return { ok: false as const, status: 500, error: selectError.message };
  }

  if (!existing) {
    console.log(
      JSON.stringify({
        job: 'daily-contents-publish',
        level: 'warn',
        message: 'no row for kst today',
        contentDate: today,
      }),
    );
    return {
      ok: true as const,
      published: false,
      contentDate: today,
      message: 'no row for this date',
    };
  }

  if (existing.is_published) {
    console.log(
      JSON.stringify({
        job: 'daily-contents-publish',
        level: 'info',
        message: 'already published',
        contentDate: today,
      }),
    );
    return {
      ok: true as const,
      published: false,
      contentDate: today,
      message: 'already published',
    };
  }

  const { error: updateError } = await supabase
    .from('daily_contents')
    .update({
      is_published: true,
      app_publish_status: 'approved_live',
      workflow_status: 'published',
      approved_at: existing.approved_at ?? new Date().toISOString(),
      published_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('content_date', today);

  if (updateError) {
    console.error(
      JSON.stringify({
        job: 'daily-contents-publish',
        level: 'error',
        step: 'update',
        message: updateError.message,
        code: updateError.code,
        contentDate: today,
      }),
    );
    return { ok: false as const, status: 500, error: updateError.message };
  }

  console.log(
    JSON.stringify({
      job: 'daily-contents-publish',
      level: 'info',
      message: 'published',
      contentDate: today,
    }),
  );
  return {
    ok: true as const,
    published: true,
    contentDate: today,
  };
}

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) {
    return denied;
  }

  try {
    const result = await runPublish();
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      JSON.stringify({
        job: 'daily-contents-publish',
        level: 'error',
        step: 'unhandled',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'publish failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
