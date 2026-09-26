import { NextResponse } from 'next/server';
import { BookingService } from '@/lib/booking-service';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('classId');
  if (!classId) return NextResponse.json({ success: false, error: 'classId required' }, { status: 400 });
  try {
    const roster = await BookingService.getTrialClassRoster(classId);
    return NextResponse.json({ success: true, roster });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, { status: 404 });
  }
}
