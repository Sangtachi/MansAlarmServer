import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'MansAlarmServer admin-web',
    timestamp: new Date().toISOString(),
  });
}
