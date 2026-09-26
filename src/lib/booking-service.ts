/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from './prisma';

export interface CreateBookingInput {
  parentId: string;
  studentId: string;
  trialClassId: string;
}

export interface ConfirmPaymentInput {
  bookingId: string;
  forcePaymentFailure?: boolean;
  amount?: number;
}

export class BookingService {
  static async createPendingBooking({ parentId, studentId, trialClassId }: CreateBookingInput) {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new Error('Student not found');
    if (student.parentId !== parentId) throw new Error('Student does not belong to the specified parent');

    const trialClass = await prisma.trialClass.findUnique({ where: { id: trialClassId } });
    if (!trialClass) throw new Error('Trial class not found');

    const existingBooking = await prisma.booking.findFirst({
      where: { trialClassId, studentId, status: { in: ['pending_payment', 'confirmed'] } },
    });
    if (existingBooking) {
      throw new Error(`DUPLICATE_BOOKING: Student ${student.name} already has an active booking (${existingBooking.status}) for this class.`);
    }

    return prisma.booking.create({
      data: { parentId, studentId, trialClassId, status: 'pending_payment', activeKey: `${trialClassId}:${studentId}` },
      include: { student: true, trialClass: true },
    });
  }

  static async confirmBookingWithPayment({ bookingId, forcePaymentFailure = false, amount = 2000 }: ConfirmPaymentInput) {
    return prisma.$transaction(async (tx: any) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { trialClass: true, student: true },
      });
      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'pending_payment') throw new Error(`Invalid booking status transition. Current status: ${booking.status}`);

      if (forcePaymentFailure) {
        const failedPayment = await tx.paymentAttempt.create({
          data: { bookingId: booking.id, amount, status: 'failed', failureReason: 'card_declined' },
        });
        const updatedBooking = await tx.booking.update({ where: { id: booking.id }, data: { status: 'payment_failed', activeKey: null } });
        return { success: false, reason: 'Payment failed (card declined)', booking: updatedBooking, payment: failedPayment };
      }

      const currentConfirmedCount: number = await tx.booking.count({
        where: { trialClassId: booking.trialClassId, status: 'confirmed' },
      });

      if (currentConfirmedCount >= booking.trialClass.maxCapacity) {
        const refundedPayment = await tx.paymentAttempt.create({
          data: { bookingId: booking.id, amount, status: 'failed', failureReason: 'class_overbooked_refunded' },
        });
        const updatedBooking = await tx.booking.update({ where: { id: booking.id }, data: { status: 'payment_failed', activeKey: null } });
        return {
          success: false,
          reason: `Class full. Capacity cap of ${booking.trialClass.maxCapacity} reached. Payment refunded/failed.`,
          booking: updatedBooking,
          payment: refundedPayment,
        };
      }

      const successfulPayment = await tx.paymentAttempt.create({
        data: { bookingId: booking.id, amount, status: 'success' },
      });
      const confirmedBooking = await tx.booking.update({ where: { id: booking.id }, data: { status: 'confirmed' } });
      return { success: true, reason: 'Booking confirmed successfully', booking: confirmedBooking, payment: successfulPayment };
    });
  }

  static async cancelBooking({ bookingId, parentId }: { bookingId: string; parentId: string }) {
    return prisma.$transaction(async (tx: any) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw new Error('Booking not found');
      if (booking.parentId !== parentId) throw new Error('Not authorized to cancel this booking');
      if (booking.status !== 'pending_payment' && booking.status !== 'confirmed') {
        throw new Error(`Cannot cancel booking with status ${booking.status}`);
      }
      const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: 'cancelled', activeKey: null } });
      return { success: true, booking: updated };
    });
  }

  static async getTrialClassRoster(trialClassId: string) {
    const trialClass = await prisma.trialClass.findUnique({
      where: { id: trialClassId },
      include: {
        bookings: {
          where: { status: 'confirmed' },
          include: { student: true, parent: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!trialClass) throw new Error('Trial class not found');
    return {
      classId: trialClass.id,
      title: trialClass.title,
      subject: trialClass.subject,
      startTime: trialClass.startTime,
      maxCapacity: trialClass.maxCapacity,
      confirmedCount: trialClass.bookings.length,
      availableSeats: Math.max(0, trialClass.maxCapacity - trialClass.bookings.length),
      roster: trialClass.bookings.map((b: any, index: number) => ({
        seatNumber: index + 1,
        studentId: b.student.id,
        studentName: b.student.name,
        studentAge: b.student.age,
        parentName: b.parent.name,
        parentEmail: b.parent.email,
        confirmedAt: b.updatedAt,
      })),
    };
  }

  static async getAllTrialClasses() {
    const classes = await prisma.trialClass.findMany({ include: { bookings: { where: { status: 'confirmed' } } } });
    return classes.map((c: any) => ({
      id: c.id,
      title: c.title,
      subject: c.subject,
      startTime: c.startTime,
      maxCapacity: c.maxCapacity,
      confirmedCount: c.bookings.length,
      availableSeats: Math.max(0, c.maxCapacity - c.bookings.length),
    }));
  }
}
