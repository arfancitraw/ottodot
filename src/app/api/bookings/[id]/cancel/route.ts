import { NextResponse } from 'next/server';
import { BookingService } from '@/lib/booking-service';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { parentId } = await req.json();
    if (!parentId) return NextResponse.json({ success: false, error: 'parentId required' }, { status: 400 });
    const result = await BookingService.cancelBooking({ bookingId: id, parentId });
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, { status: 400 });
  }
}
