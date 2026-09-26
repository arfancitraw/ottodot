# Project Guide: Ottodot Trial Class Booking System

## Overview
Smallest working slice of a trial booking system for Ottodot (kids online science/math classes).
Target: High correctness under race conditions, zero overbooking, clear data invariants, robust tests.

## Key Rules & Invariants
1. Max capacity per trial class is strictly 4 CONFIRMED students.
2. Duplicate confirmed/pending bookings for the same child and class are STRICTLY PROHIBITED.
3. Payment failure MUST NOT add the child to the confirmed roster.
4. Concurrency: Handle last-seat race conditions atomically using DB transactions (`prisma.$transaction`).
5. Status Lifecycle: `pending_payment` -> `confirmed` OR `payment_failed` OR `cancelled`.

## Tech Stack
- Framework: Next.js (App Router, TypeScript)
- Database: SQLite + Prisma ORM
- Testing: Vitest / Jest

## Schema Specs
- Parent: id, name, email
- Student: id, parentId, name, age
- TrialClass: id, title, subject, startTime, maxCapacity (default 4)
- Booking: id, trialClassId, studentId, parentId, status, createdAt, updatedAt
- PaymentAttempt: id, bookingId, amount, status, failureReason, createdAt

## Seed Data Cases
1. `class_available`: Trial class with 0 or 1 confirmed student.
2. `class_almost_full`: Trial class with EXACTLY 3 confirmed students (1 seat left).
3. `duplicate_test_parent`: Parent & child already registered for `class_available`.
4. `payment_fail_trigger`: Mock card detail or flag that triggers payment failure.
