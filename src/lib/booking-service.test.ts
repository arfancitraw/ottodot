import { describe, it, expect, beforeEach } from 'vitest';
import { BookingService } from './booking-service';
import { prisma } from './prisma';

describe('Ottodot Trial Booking Service Tests', () => {
  beforeEach(async () => {
    // Reset database to initial seed state before each test
    await prisma.paymentAttempt.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.student.deleteMany();
    await prisma.parent.deleteMany();
    await prisma.trialClass.deleteMany();

    // Re-seed essential test data
    await prisma.parent.create({
      data: {
        id: 'parent_1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        students: { create: [{ id: 'student_1', name: 'Leo Smith', age: 8 }] },
      },
    });

    await prisma.parent.create({
      data: {
        id: 'parent_2',
        name: 'Bob Johnson',
        email: 'bob@example.com',
        students: { create: [{ id: 'student_2', name: 'Maya Johnson', age: 9 }] },
      },
    });

    await prisma.parent.create({
      data: {
        id: 'parent_3',
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        students: { create: [{ id: 'student_3', name: 'Sam Brown', age: 7 }] },
      },
    });

    await prisma.parent.create({
      data: {
        id: 'parent_4',
        name: 'David Miller (User A)',
        email: 'david@example.com',
        students: { create: [{ id: 'student_4', name: 'Emma Miller', age: 8 }] },
      },
    });

    await prisma.parent.create({
      data: {
        id: 'parent_5',
        name: 'Eva Green (User B)',
        email: 'eva@example.com',
        students: { create: [{ id: 'student_5', name: 'Noah Green', age: 10 }] },
      },
    });

    // Create trial class (capacity 4)
    await prisma.trialClass.create({
      data: {
        id: 'class_almost_full',
        title: 'Primary Math Challenge',
        subject: 'Math',
        startTime: new Date(Date.now() + 86400000),
        maxCapacity: 4,
      },
    });

    // Create 3 existing confirmed bookings for class_almost_full
    await prisma.booking.create({
      data: {
        id: 'booking_1',
        trialClassId: 'class_almost_full',
        parentId: 'parent_1',
        studentId: 'student_1',
        status: 'confirmed',
        payments: { create: [{ amount: 2000, status: 'success' }] },
      },
    });

    await prisma.booking.create({
      data: {
        id: 'booking_2',
        trialClassId: 'class_almost_full',
        parentId: 'parent_2',
        studentId: 'student_2',
        status: 'confirmed',
        payments: { create: [{ amount: 2000, status: 'success' }] },
      },
    });

    await prisma.booking.create({
      data: {
        id: 'booking_3',
        trialClassId: 'class_almost_full',
        parentId: 'parent_3',
        studentId: 'student_3',
        status: 'confirmed',
        payments: { create: [{ amount: 2000, status: 'success' }] },
      },
    });
  });

  it('1. Should allow booking when seats are available', async () => {
    const pendingBooking = await BookingService.createPendingBooking({
      parentId: 'parent_4',
      studentId: 'student_4',
      trialClassId: 'class_almost_full',
    });

    expect(pendingBooking.status).toBe('pending_payment');

    const result = await BookingService.confirmBookingWithPayment({
      bookingId: pendingBooking.id,
    });

    expect(result.success).toBe(true);
    expect(result.booking.status).toBe('confirmed');

    const roster = await BookingService.getTrialClassRoster('class_almost_full');
    expect(roster.confirmedCount).toBe(4);
    expect(roster.availableSeats).toBe(0);
  });

  it('2. Should prevent duplicate booking for the same child and class', async () => {
    // Student 1 is already confirmed in class_almost_full
    await expect(
      BookingService.createPendingBooking({
        parentId: 'parent_1',
        studentId: 'student_1',
        trialClassId: 'class_almost_full',
      })
    ).rejects.toThrow(/DUPLICATE_BOOKING/);
  });

  it('3. Should handle payment failure without adding child to confirmed roster', async () => {
    const pendingBooking = await BookingService.createPendingBooking({
      parentId: 'parent_4',
      studentId: 'student_4',
      trialClassId: 'class_almost_full',
    });

    const result = await BookingService.confirmBookingWithPayment({
      bookingId: pendingBooking.id,
      forcePaymentFailure: true,
    });

    expect(result.success).toBe(false);
    expect(result.booking.status).toBe('payment_failed');
    expect(result.payment.status).toBe('failed');
    expect(result.payment.failureReason).toBe('card_declined');

    // Verify roster count did NOT increase
    const roster = await BookingService.getTrialClassRoster('class_almost_full');
    expect(roster.confirmedCount).toBe(3);
  });

  it('4. REQUIRED SCENARIO: Should handle Last-Seat Race Condition cleanly (Max 4 confirmed)', async () => {
    // 3 students are already confirmed. Only 1 seat remains.
    // User A (parent_4) and User B (parent_5) both create pending bookings.
    const bookingA = await BookingService.createPendingBooking({
      parentId: 'parent_4',
      studentId: 'student_4',
      trialClassId: 'class_almost_full',
    });

    const bookingB = await BookingService.createPendingBooking({
      parentId: 'parent_5',
      studentId: 'student_5',
      trialClassId: 'class_almost_full',
    });

    // Simulate simultaneous payment confirmation using Promise.all
    const [resultA, resultB] = await Promise.all([
      BookingService.confirmBookingWithPayment({ bookingId: bookingA.id }),
      BookingService.confirmBookingWithPayment({ bookingId: bookingB.id }),
    ]);

    const results = [resultA, resultB];
    const successfulCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    // Verify exactly ONE user succeeded and ONE user failed
    expect(successfulCount).toBe(1);
    expect(failedCount).toBe(1);

    // Verify the failed attempt reason
    const failedResult = results.find((r) => !r.success);
    expect(failedResult?.booking.status).toBe('payment_failed');
    expect(failedResult?.payment.failureReason).toBe('class_overbooked_refunded');

    // Verify roster strictly capped at 4
    const roster = await BookingService.getTrialClassRoster('class_almost_full');
    expect(roster.confirmedCount).toBe(4);
    expect(roster.availableSeats).toBe(0);
  });
});
