'use server';

import { BookingService } from '@/lib/booking-service';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

export async function getParentsAndStudents() {
  const parents = await prisma.parent.findMany({
    include: {
      students: true,
    },
  });
  return parents;
}

export async function getTrialClasses() {
  return await BookingService.getAllTrialClasses();
}

export async function getRosterAction(classId: string) {
  return await BookingService.getTrialClassRoster(classId);
}

export async function createPendingBookingAction(parentId: string, studentId: string, trialClassId: string) {
  try {
    const booking = await BookingService.createPendingBooking({ parentId, studentId, trialClassId });
    revalidatePath('/');
    return { success: true, booking };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

export async function confirmPaymentAction(bookingId: string, forcePaymentFailure: boolean = false) {
  try {
    const result = await BookingService.confirmBookingWithPayment({ bookingId, forcePaymentFailure });
    revalidatePath('/');
    return result;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, reason: errorMessage };
  }
}

export async function resetDatabaseAction() {
  // Re-run seed
  const { execSync } = require('child_process');
  execSync('npx tsx prisma/seed.ts');
  revalidatePath('/');
  return { success: true };
}
