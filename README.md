# Ottodot Trial Class Booking System

Smallest working slice of a trial booking system for Ottodot live science and math classes, built with Next.js (App Router), TypeScript, SQLite, and Prisma ORM.

## 🚀 How to Run the Solution

### Prerequisites
- Node.js 18+ or 20+
- npm

### Setup Steps
```bash
# 1. Install dependencies
npm install

# 2. Push Prisma database schema to SQLite
npx prisma db push

# 3. Seed synthetic test data
npm run db:seed

# 4. Run automated tests (includes concurrency & race condition tests)
npm test

# 5. Start development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

> **API:** See [API.md](API.md) — curl examples + `postman/Ottodot.postman_collection.json` (import to Postman, baseUrl `http://localhost:3000`).

---

## 📌 What Was Built
1. **Parent Trial Booking**: Parent can choose a child, select a trial class with available seats, submit a trial booking (`pending_payment`), and complete mock payment.
2. **Mock Payment & Status Tracking**: Handles both successful payments and simulated card declines/failures without adding unconfirmed students to the roster.
3. **Teacher / Admin Roster View**: Simple UI and API (`getTrialClassRoster`) displaying confirmed students per trial class, seat capacity, and seat numbers.
4. **Last-Seat Race Condition Handling**: Guarantees that at most 4 students can end up with a confirmed booking for any trial class, even under parallel concurrent requests.
5. **Interactive Race Condition Simulator**: Included in the web UI under the "⚡ Last-Seat Race Demo" tab to visually execute concurrent `Promise.all()` payments and verify system invariants.

---

## ⏱️ Time Spent & Assumptions

* **Time Spent**: ~3.5 hours
* **Assumptions Made**:
  - Trial classes have a strict cap of 4 confirmed students.
  - Parents can book for multiple children, but a child cannot hold more than one active (`pending_payment` or `confirmed`) booking for the same trial class.
  - Payment occurs after initiating the booking; pending bookings do not reserve seats until payment is atomically confirmed at checkout time.

---

## 🏛️ Architecture & Backend Design Decisions

### 1. Data Model & Schema
* `Parent` (`id`, `name`, `email`)
* `Student` (`id`, `parentId`, `name`, `age`)
* `TrialClass` (`id`, `title`, `subject`, `startTime`, `maxCapacity`=4)
* `Booking` (`id`, `trialClassId`, `studentId`, `parentId`, `status`, `activeKey`, `createdAt`, `updatedAt`)
  - **Active-only unique:** `activeKey String? @unique` = `"${trialClassId}:${studentId}"` when `pending_payment|confirmed`, `null` when `payment_failed|cancelled` (SQLite null not colliding) — prevents duplicate active while allowing rebook after cancel/fail; history kept. `@@index([trialClassId, studentId])` for lookup. (Replaces plain `@@unique([trialClassId, studentId])` which blocked rebook.)
* `PaymentAttempt` (`id`, `bookingId`, `amount`, `status`, `failureReason`, `createdAt`)

### 2. Booking Status Lifecycle
* `pending_payment`: Initial state when parent selects child & trial class.
* `confirmed`: Payment successful AND capacity check (< 4) passed atomically.
* `payment_failed`: Card declined OR class overbooked during payment processing (payment refunded).
* `cancelled`: Booking explicitly cancelled (frees seat, allows same child+class to rebook; row kept with `activeKey=null`).

### 3. Last-Seat Race Condition Handling Strategy
* **Approach**: **Atomic Capacity Check inside Database Transaction (`prisma.$transaction`)**.
* **Why This Approach**:
  - Ensures 100% serializability and correctness without requiring complex background queue/cron systems.
  - SQLite write locking (`BEGIN IMMEDIATE`) ensures that concurrent `confirmBookingWithPayment` requests are executed sequentially at the database level.
  - If User A and User B process payment simultaneously for the 4th (last) seat:
    1. Transaction 1 executes: Checks confirmed count (3 < 4) -> Updates User A to `confirmed`, creates success `PaymentAttempt`. Commit.
    2. Transaction 2 executes: Checks confirmed count (4 >= 4) -> Rejects User B confirmation, updates User B to `payment_failed` (`failureReason: class_overbooked_refunded`), creates failed `PaymentAttempt`. Commit.
* **Tradeoffs Accepted**:
  - User B might experience a payment attempt that gets immediately refunded because User A completed payment milliseconds earlier. (Can be mitigated with short 5-minute temporary seat hold reservations in a full production system).

### 4. Check Placements
* **UI**: Input validation, immediate user feedback, interactive selection.
* **Backend (`BookingService`)**: Duplicate booking validation, status state machine transitions, orchestration of atomic transactions.
* **Database (SQLite/Prisma)**: Foreign key constraints, active-only unique via `activeKey` (see above), `@@index([trialClassId, studentId])`.
* **Background job (cut):** `pending_payment` expiry cron (e.g. every 5min, cancel `pending_payment` >30min old, set `activeKey=null`) — deliberately cut, would run as future scheduled job.

---

## ✂️ What Was Deliberately Cut
- Complex OAuth / Parent Authentication (used dropdown selection for demo simplicity).
- Live Stripe / External Payment Gateway integration (used mock payment handler).
- Email / SMS notification dispatcher on booking confirmation.
- Expiration timer cron worker for stale `pending_payment` bookings.

---

## 📈 Post-Release Monitoring & Next Steps

### What to Monitor After Release:
1. **Overbook Attempt Rate**: Alert if `class_overbooked_refunded` events spike (indicates high demand, suggest adding more class slots).
2. **Payment Failure Rates**: Distinguish between card declines vs overbooking refunds.
3. **P99 Latency of `confirmBookingWithPayment`**: Monitor DB lock wait time under high concurrency.

### Next Steps with More Time:
1. **Temporary Reservation Hold (5-min lock)**: Implement Redis-based or DB-based seat hold timer when user lands on checkout page to reduce payment friction.
2. **Waitlist Feature**: Allow parents to join a waitlist when a trial class hits 4/4 confirmed students.
3. **Automated Reminders**: Schedule automated email/calendar invites for confirmed trial students 24h before class starts.
