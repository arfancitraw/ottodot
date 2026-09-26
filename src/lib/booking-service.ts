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
  /**
   * Step 1: Create a pending booking for a student and trial class.
   * Handles duplicate booking check.
   */
  static async createPendingBooking({ parentId, studentId, trialClassId }: CreateBookingInput) {
    // Cek ketersediaan student dan class
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new Error('Student not found');
    }
    if (student.parentId !== parentId) {
      throw new Error('Student does not belong to the specified parent');
    }

    const trialClass = await prisma.trialClass.findUnique({
      where: { id: trialClassId },
    });
    if (!trialClass) {
      throw new Error('Trial class not found');
    }

    // Edge Case: Cek duplicate active booking (pending_payment atau confirmed)
    const existingBooking = await prisma.booking.findFirst({
      where: {
        trialClassId,
        studentId,
        status: { in: ['pending_payment', 'confirmed'] },
      },
    });

    if (existingBooking) {
      throw new Error(`DUPLICATE_BOOKING: Student ${student.name} already has an active booking (${existingBooking.status}) for this class.`);
    }

    // Buat booking berstatus pending_payment
    return await prisma.booking.create({
      data: {
        parentId,
        studentId,
        trialClassId,
        status: 'pending_payment',
      },
      include: {
        student: true,
        trialClass: true,
      },
    });
  }

  /**
   * Step 2: Confirm booking upon payment.
   * Executed atomically inside a database transaction.
   * Handles:
   *  - Last-seat race condition (max 4 confirmed limit enforcement)
   *  - Payment failure recording without adding student to confirmed roster
   */
  static async confirmBookingWithPayment({ bookingId, forcePaymentFailure = false, amount = 2000 }: ConfirmPaymentInput) {
    return await prisma.$transaction(async (tx) => {
      // Fetch booking
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { trialClass: true, student: true },
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      if (booking.status !== 'pending_payment') {
        throw new Error(`Invalid booking status transition. Current status: ${booking.status}`);
      }

      // Case 1: Payment Failure Case
      if (forcePaymentFailure) {
        const failedPayment = await tx.paymentAttempt.create({
          data: {
            bookingId: booking.id,
            amount,
            status: 'failed',
            failureReason: 'card_declined',
          },
        });

        const updatedBooking = await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'payment_failed' },
        });

        return {
          success: false,
          reason: 'Payment failed (card declined)',
          booking: updatedBooking,
          payment: failedPayment,
        };
      }

      // Case 2: Atomic Capacity Check (Last-Seat Race Condition protection)
      const currentConfirmedCount = await tx.booking.count({
        where: {
          trialClassId: booking.trialClassId,
          status: 'confirmed',
        },
      });

      if (currentConfirmedCount >= booking.trialClass.maxCapacity) {
        // Seat already taken by another user who completed payment first!
        const refundedPayment = await tx.paymentAttempt.create({
          data: {
            bookingId: booking.id,
            amount,
            status: 'failed',
            failureReason: 'class_overbooked_refunded',
          },
        });

        const updatedBooking = await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'payment_failed' },
        });

        return {
          success: false,
          reason: `Class full. Capacity cap of ${booking.trialClass.maxCapacity} reached. Payment refunded/failed.`,
          booking: updatedBooking,
          payment: refundedPayment,
        };
      }

      // Case 3: Success Confirmation
      const successfulPayment = await tx.paymentAttempt.create({
        data: {
          bookingId: booking.id,
          amount,
          status: 'success',
        },
      });

      const confirmedBooking = await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'confirmed' },
      });

      return {
        success: true,
        reason: 'Booking confirmed successfully',
        booking: confirmedBooking,
        payment: successfulPayment,
      };
    });
  }

  /**
   * Helper: Get Trial Class Roster for Admin / Teachers
   */
  static async getTrialClassRoster(trialClassId: string) {
    const trialClass = await prisma.trialClass.findUnique({
      where: { id: trialClassId },
      include: {
        bookings: {
          where: { status: 'confirmed' },
          include: {
            student: true,
            parent: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!trialClass) {
      throw new Error('Trial class not found');
    }

    return {
      classId: trialClass.id,
      title: trialClass.title,
      subject: trialClass.subject,
      startTime: trialClass.startTime,
      maxCapacity: trialClass.maxCapacity,
      confirmedCount: trialClass.bookings.length,
      availableSeats: Math.max(0, trialClass.maxCapacity - trialClass.bookings.length),
      roster: trialClass.bookings.map((b, index) => ({
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

  /**
   * Helper: List all trial classes with seat counts
   */
  static async getAllTrialClasses() {
    const classes = await prisma.trialClass.findMany({
      include: {
        bookings: {
          where: { status: 'confirmed' },
        },
      },
    });

    return classes.map((c) => ({
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
