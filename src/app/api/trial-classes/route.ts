import { NextResponse } from 'next/server';
import { BookingService } from '@/lib/booking-service';

export const runtime = 'nodejs';

export async function GET() {
  const classes = await BookingService.getAllTrialClasses();
  return NextResponse.json({ success: true, classes });
}
