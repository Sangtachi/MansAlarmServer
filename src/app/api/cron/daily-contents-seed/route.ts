import { NextRequest, NextResponse } from 'next/server';

import { addDaysToYmd, buildUpcomingDrafts, getKstTodayYmd } from '@/lib/contentGenerator';
import { buildDailyContentInsertRow } from '@/lib/dailyContentCronInsert';
import { requireCronSecret } from '@/lib/cronSecretAuth';
import { getServiceRoleSupabase } from '@/lib/supabaseServiceRole';
import { ContentSeasonRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function runSeed() {
  const supabase = getServiceRoleSupabase();
  const D = getKstTodayYmd();
  const startDate = addDaysToYmd(D, 1);
  const targetDates = [startDate, addDaysToYmd(D, 2)];

  const seasonsResult = await supabase.from('content_seasons').select('*').order('month_key', { ascending: false });
  if (seasonsResult.error) {
    return { ok: false as const, status: 500, error: seasonsResult.error.message };
  }

  const seasons = (seasonsResult.data ?? []) as ContentSeasonRow[];
  if (seasons.length === 0) {
    return {
      ok: false as const,
      status: 503,
      error: 'content_seasons is empty; create a season before running the seed cron.',
    };
  }

  const existingResult = await supabase
    .from('daily_contents')
    .select('content_date')
    .in('content_date', targetDates);

  if (existingResult.error) {
    return { ok: false as const, status: 500, error: existingResult.error.message };
  }

  const existingSet = new Set((existingResult.data ?? []).map((row) => row.content_date));
  const drafts = buildUpcomingDrafts({
    startDate,
    days: 2,
    seasons,
    preferredSeasonId: null,
    generatorProvider: 'veo',
    seedArchetype: null,
    publishMode: 'scheduled',
  });

  const toInsert = drafts.filter((draft) => !existingSet.has(draft.contentDate));
  if (toInsert.length === 0) {
    console.log(
      JSON.stringify({
        job: 'daily-contents-seed',
        level: 'info',
        message: 'all target dates already exist',
        skippedDates: targetDates,
        kstToday: D,
      }),
    );
    return {
      ok: true as const,
      createdCount: 0,
      skippedDates: targetDates,
      targetDates,
      kstToday: D,
    };
  }

  const insertPayload = toInsert.map((draft) => buildDailyContentInsertRow(draft, null));
  const insertResult = await supabase.from('daily_contents').insert(insertPayload).select('id, content_date');

  if (insertResult.error) {
    console.error(
      JSON.stringify({
        job: 'daily-contents-seed',
        level: 'error',
        step: 'insert',
        message: insertResult.error.message,
        code: insertResult.error.code,
      }),
    );
    return { ok: false as const, status: 500, error: insertResult.error.message };
  }

  const inserted = insertResult.data ?? [];
  console.log(
    JSON.stringify({
      job: 'daily-contents-seed',
      level: 'info',
      createdDates: inserted.map((r) => r.content_date),
      kstToday: D,
    }),
  );

  return {
    ok: true as const,
    createdCount: inserted.length,
    createdDates: inserted.map((r) => r.content_date),
    skippedDates: targetDates.filter((d) => existingSet.has(d)),
    targetDates,
    kstToday: D,
  };
}

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) {
    return denied;
  }

  try {
    const result = await runSeed();
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      JSON.stringify({
        job: 'daily-contents-seed',
        level: 'error',
        step: 'unhandled',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'seed failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
