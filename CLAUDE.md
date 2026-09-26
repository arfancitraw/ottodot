# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ottodot Trial Class Booking System — smallest working slice of a live trial booking system for kids' online science/math classes. Single-page Next.js app: Parent Booking flow + Teacher Roster + Last-Seat Race Simulator. Core value is deterministic invariant enforcement under concurrency, not UI polish.

## Commands

```bash
npm install                  # install deps
npx prisma db push           # push schema to SQLite (no migrations)
npm run db:seed              # seed via tsx prisma/seed.ts — 6 parents/children, 2 classes, 3 confirmed bookings
npm run dev                  # Next.js dev server (http://localhost:3000)
npm run build                # production build (Turbopack)
npm run lint                 # eslint (next/core-web-vitals + typescript)
npm test                     # or: npx vitest run — 4 tests incl. Promise.all race
npx vitest run -t "race"     # single test by name pattern
```

No `vitest.config.*` — uses Vitest defaults. No `DATABASE_URL` prefix needed locally; `.env` is `file:./dev.db` relative to `prisma/`.

To reset during dev: `npx prisma db push && npm run db:seed` or use the "Reset Database & Seed" button / `resetDatabaseAction` (runs `npx tsx prisma/seed.ts` via `execSync`).

## Architecture

**Stack:** Next.js 16.3.6 App Router + TypeScript (strict) + React 19, Prisma 5.22 + SQLite (`prisma/dev.db`), Tailwind 4, Vitest 3. Path alias `@/*` → `src/*`.

**Data model (`prisma/schema.prisma`):** `Parent` 1—N `Student`, `Parent`/`Student`/`TrialClass` N—N via `Booking`, `Booking` 1—N `PaymentAttempt`. `Booking @@unique([trialClassId, studentId])` prevents duplicates at DB level. Status fields are plain `String` (no enum): Booking `pending_payment | confirmed | payment_failed | cancelled`, PaymentAttempt `success | failed` + `failureReason: card_declined | class_overbooked_refunded`.

**Core service — `src/lib/booking-service.ts` (`BookingService`):**
- `createPendingBooking({ parentId, studentId, trialClassId })` — validates student belongs to parent, checks `status in [pending_payment, confirmed]` for duplicate → throws `DUPLICATE_BOOKING`, creates `pending_payment` booking.
- `confirmBookingWithPayment({ bookingId, forcePaymentFailure, amount })` — entire body inside `prisma.$transaction(async (tx) => ...)`. Order: fetch booking → validate `pending_payment` → if `forcePaymentFailure` record `failed/card_declined` → else count `confirmed` for `trialClassId` → if `count >= maxCapacity` record `failed/class_overbooked_refunded` → else record `success` + set `confirmed`. Returns `{ success, reason, booking, payment }`. SQLite `BEGIN IMMEDIATE` serializes concurrent confirms.
- `getTrialClassRoster(trialClassId)` / `getAllTrialClasses()` — roster sorted `createdAt asc`, derives `confirmedCount`/`availableSeats`, maps `seatNumber = index+1`.

**Server Actions — `src/app/actions.ts`:** thin wrappers (`getParentsAndStudents`, `getTrialClasses`, `getRosterAction`, `createPendingBookingAction`, `confirmPaymentAction`, `resetDatabaseAction`) that call `BookingService`/`prisma` + `revalidatePath('/')`. Error shape: `{ success: false, error/reason }`.

**UI — `src/app/page.tsx`:** single `'use client'` component, 3 tabs (`booking | roster | race_demo`). No auth — parent selected via dropdown. Race demo resets DB, creates two pending bookings (`parent_4`/`student_4` + `parent_5`/`student_5` on `class_almost_full`), runs `Promise.all([confirm...])`, displays invariant check.

**Prisma client — `src/lib/prisma.ts`:** global singleton (avoids hot-reload duplication), logs `query/info/warn/error` in dev.

## Non-Negotiable Invariants

1. `COUNT(confirmed) <= maxCapacity (4)` per `TrialClass` — enforced inside transaction count check, never outside.
2. No duplicate active booking (`pending_payment` or `confirmed`) for same `(trialClassId, studentId)` — application check + `@@unique` constraint.
3. Payment failure never yields `confirmed` — both `card_declined` and `class_overbooked_refunded` set `payment_failed`.
4. All payment confirmation logic must stay inside `prisma.$transaction`; pre-checking capacity outside the transaction is a TOCTOU bug.
5. Status lifecycle is strict: `pending_payment → confirmed | payment_failed`, plus `cancelled` terminal state.

## Project Structure

```
prisma/
  schema.prisma       # 5 models, SQLite datasource
  seed.ts             # deterministic IDs: parent_1..6, student_1..6, class_available, class_almost_full, booking_seed_1..3
  dev.db              # SQLite file (gitignored via .env* but file exists locally)
src/
  lib/
    prisma.ts         # singleton client
    booking-service.ts
    booking-service.test.ts  # 4 tests, beforeEach re-creates seed state
  app/
    actions.ts        # server actions
    page.tsx          # all UI
    layout.tsx        # Geist fonts, metadata
    globals.css       # Tailwind
```

Seed cases: `class_available` (0 confirmed), `class_almost_full` (3 confirmed, 1 seat left — the race target), `parent_1/student_1` already in `class_almost_full` (duplicate test), `parent_6/student_6` (card-decline test), `parent_4`/`parent_5` (race candidates A/B).

## Tests

`src/lib/booking-service.test.ts` — 4 Vitest tests, each `beforeEach` wipes and re-seeds `class_almost_full` + 3 confirmed bookings:
1. Available seat — create pending → confirm → assert `confirmedCount 4`.
2. Duplicate — `createPendingBooking` for already-confirmed `student_1` → throws `/DUPLICATE_BOOKING/`.
3. Payment failure — `forcePaymentFailure: true` → `payment_failed`/`card_declined`, roster stays 3.
4. Race — two pendings then `Promise.all` confirms → exactly 1 success / 1 `class_overbooked_refunded`, roster 4.

## Conventions to Preserve

- Keep `failureReason` camelCase (schema field is `failureReason`, not `failure_reason`).
- Keep deterministic seed IDs — tests and race demo hardcode `parent_4`, `student_5`, `class_almost_full`, etc.
- Keep `prisma.$transaction` with callback form `prisma.$transaction(async (tx) => ...)` and use `tx.*` inside; don't switch to array form.
- `actions.ts:resetDatabaseAction` uses `require('child_process').execSync` — intentional sync re-seed for demo; don't refactor to async without testing dev UX.
- No Cursor/Copilot rules, no Gemini/Codex configs in repo — nothing to import.
