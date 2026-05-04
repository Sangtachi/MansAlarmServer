import { NextRequest, NextResponse } from 'next/server';

/**
 * Vercel Cron and manual invocations must send the same secret as env CRON_SECRET.
 * Accepts `Authorization: Bearer <secret>` or `x-cron-secret: <secret>`.
 */
export function requireCronSecret(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not configured on the server.' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization')?.trim() ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const headerSecret = request.headers.get('x-cron-secret')?.trim() ?? '';

  if (bearer === expected || headerSecret === expected) {
    return null;
  }

  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
}
