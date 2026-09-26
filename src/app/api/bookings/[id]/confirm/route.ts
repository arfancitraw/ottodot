import { NextResponse } from 'next/server';
import { BookingService } from '@/lib/booking-service';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const result = await BookingService.confirmBookingWithPayment({
      bookingId: id,
      forcePaymentFailure: !!body.forcePaymentFailure,
      amount: body.amount ?? 2000,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ success: false, reason: e instanceof Error ? e.message : 'Unknown error' }, { status: 400 });
  }
}
