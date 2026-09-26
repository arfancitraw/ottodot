# CLAUDE.md - Master Engineering Guide & Instructions for Claude Code

## Project Overview
Ottodot Trial Class Booking System: A production-grade, smallest working slice of a live trial booking system for kids' online science and math classes.

Primary Goal: Build a rock-solid, highly deterministic backend and minimal full-stack application that enforces hard business invariants, handles concurrent booking race conditions gracefully, records payment results accurately, and provides a clear roster view.

---

## 🛑 Non-Negotiable Invariants & Core Business Rules
1. **Strict Capacity Cap**: A trial class can have at most **4 CONFIRMED** students (`COUNT(confirmed) <= 4`). No exceptions.
2. **No Duplicate Active Bookings**: A student cannot have more than one active booking (`pending_payment` or `confirmed`) for the same trial class.
3. **Payment Failure Isolation**: A payment failure (`card_declined` or overbooking refund) MUST NEVER result in the student being added to the confirmed roster.
4. **Atomic Concurrency Protection**: Race conditions on the last available seat (4th seat) MUST be handled atomically using database transactions (`prisma.$transaction`).
5. **Exact Status Lifecycle**:
   - `pending_payment`: Booking created, awaiting payment.
   - `confirmed`: Payment succeeded AND seat capacity check passed inside atomic transaction.
   - `payment_failed`: Payment failed (card declined OR class overbooked during checkout).
   - `cancelled`: Booking explicitly cancelled.

---

## 🛠️ Recommended Tech Stack & Environment
- **Framework**: Next.js (App Router, TypeScript, Server Actions)
- **Database**: SQLite with Prisma ORM (v5.x)
- **Testing**: Vitest (`vitest run`)
- **Styling**: Tailwind CSS

---

## 📁 Required Project Directory Structure
```
ottodot-trial-booking/
├── CLAUDE.md                   # This master prompt guide
├── README.md                   # Project summary, architecture, tradeoffs, run instructions
├── AI_USAGE.md                 # AI tool usage declaration & verification proof
├── package.json                # Scripts: dev, build, db:seed, test
├── prisma/
│   ├── schema.prisma           # Complete database schema
│   ├── seed.ts                 # Synthetic seed data (4 required test cases)
│   └── dev.db                  # SQLite database file
├── src/
│   ├── lib/
│   │   ├── prisma.ts           # Global Prisma client singleton
│   │   ├── booking-service.ts  # Core business logic & atomic transactions
│   │   └── booking-service.test.ts # Vitest suite with Promise.all race condition test
│   └── app/
│       ├── actions.ts          # Server Actions exposing service to UI
│       ├── page.tsx            # Single page App (Booking Form, Admin Roster, Race Simulator)
│       └── globals.css         # Tailwind styles
```

---

## 🗄️ Database Schema Specification (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Parent {
  id        String    @id @default(uuid())
  name      String
  email     String    @unique
  students  Student[]
  bookings  Booking[]
}

model Student {
  id        String    @id @default(uuid())
  parentId  String
  parent    Parent    @relation(fields: [parentId], references: [id], onDelete: Cascade)
  name      String
  age       Int
  bookings  Booking[]
}

model TrialClass {
  id          String    @id @default(uuid())
  title       String
  subject     String
  startTime   DateTime
  maxCapacity Int       @default(4)
  bookings    Booking[]
}

model Booking {
  id           String           @id @default(uuid())
  trialClassId String
  trialClass   TrialClass       @relation(fields: [trialClassId], references: [id], onDelete: Cascade)
  studentId    String
  student      Student          @relation(fields: [studentId], references: [id], onDelete: Cascade)
  parentId     String
  parent       Parent           @relation(fields: [parentId], references: [id], onDelete: Cascade)
  status       String           // pending_payment, confirmed, payment_failed, cancelled
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  payments     PaymentAttempt[]

  @@unique([trialClassId, studentId], name: "unique_active_booking")
}

model PaymentAttempt {
  id            String   @id @default(uuid())
  bookingId     String
  booking       Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  amount        Int
  status        String   // success, failed
  failureReason String?  // card_declined, class_overbooked_refunded
  createdAt     DateTime @default(now())
}
```

---

## ⚡ Key Logic & Concurrency Algorithm (`src/lib/booking-service.ts`)

### 1. `createPendingBooking({ parentId, studentId, trialClassId })`
- Check if student exists & belongs to parent.
- Check if student already has an active booking (`pending_payment` or `confirmed`) for `trialClassId`.
  - If yes, throw `Error('DUPLICATE_BOOKING: Student already registered for this trial class.')`.
- Create booking record with `status: 'pending_payment'`.

### 2. `confirmBookingWithPayment({ bookingId, forcePaymentFailure = false, amount = 2000 })`
- Must execute inside `prisma.$transaction(async (tx) => { ... })`:
  1. Fetch booking with `trialClass`.
  2. Validate current status is `pending_payment`.
  3. If `forcePaymentFailure` is true:
     - Record `PaymentAttempt` (`status: 'failed'`, `failureReason: 'card_declined'`).
     - Update `Booking` status to `payment_failed`.
     - Return `{ success: false, reason: 'Payment failed (card declined)', booking, payment }`.
  4. Capacity Check (Atomic Lock):
     - Count confirmed bookings: `const count = await tx.booking.count({ where: { trialClassId, status: 'confirmed' } })`.
     - If `count >= trialClass.maxCapacity`:
       - Record `PaymentAttempt` (`status: 'failed'`, `failureReason: 'class_overbooked_refunded'`).
       - Update `Booking` status to `payment_failed`.
       - Return `{ success: false, reason: 'Class full. Refunded.', booking, payment }`.
  5. If `count < trialClass.maxCapacity`:
     - Record `PaymentAttempt` (`status: 'success'`).
     - Update `Booking` status to `confirmed`.
     - Return `{ success: true, reason: 'Booking confirmed', booking, payment }`.

---

## 🧪 Required Seed Data (`prisma/seed.ts`)
Must include 4 distinct test cases:
1. `class_available`: Trial class with 0 or 1 confirmed student.
2. `class_almost_full`: Trial class with **EXACTLY 3 confirmed students** (only 1 seat remaining).
3. `duplicate_test_parent`: Parent & child already registered in `class_almost_full` for duplicate booking testing.
4. `payment_fail_trigger`: Student & parent dedicated for testing card decline simulation.

---

## 🏁 Automated Testing Requirements (`src/lib/booking-service.test.ts`)
Write Vitest tests for all 4 scenarios:
1. **Available Seat Test**: Successfully book & confirm when seats are available.
2. **Duplicate Booking Test**: Reject duplicate booking attempt for the same child & class.
3. **Payment Failure Test**: Ensure failed payment sets status to `payment_failed` without adding student to confirmed roster.
4. **Last-Seat Race Condition Test**:
   - `class_almost_full` has 3 confirmed students.
   - User A (David) and User B (Eva) create pending bookings for their respective children.
   - Execute parallel confirmation: `Promise.all([confirmBooking(A), confirmBooking(B)])`.
   - Assert: Exactly **1 succeeds** (`confirmed`), **1 fails** (`payment_failed`), and roster total `confirmed` count is **strictly 4**.

---

## 💻 Commands for Claude Code Execution & Verification
When instructing Claude Code, run these commands to verify:
- Database Setup: `npx prisma db push && npx tsx prisma/seed.ts`
- Run Tests: `npx vitest run`
- Build Application: `npm run build`
- Dev Server: `npm run dev`
