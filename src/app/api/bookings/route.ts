import { NextResponse } from 'next/server';
import { BookingService } from '@/lib/booking-service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { parentId, studentId, trialClassId } = await req.json();
    if (!parentId || !studentId || !trialClassId) {
      return NextResponse.json({ success: false, error: 'parentId, studentId, trialClassId required' }, { status: 400 });
    }
    const booking = await BookingService.createPendingBooking({ parentId, studentId, trialClassId });
    return NextResponse.json({ success: true, booking });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg.includes('DUPLICATE_BOOKING') ? 409 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
