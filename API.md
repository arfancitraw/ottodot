# Ottodot Trial Booking — API Documentation

Base URL: `http://localhost:3000`

Prereqs: `npm run dev` running, DB seeded (`npx prisma db push && npm run db:seed`). All bodies `Content-Type: application/json`. Mock payment, no auth token.

## Seed IDs (deterministic, copy to Postman)

| Parent | Student |
|---|---|
| `parent_1` Alice Smith | `student_1` Leo Smith, 8 |
| `parent_2` Bob Johnson | `student_2` Maya Johnson, 9 |
| `parent_3` Charlie Brown | `student_3` Sam Brown, 7 |
| `parent_4` David Miller (User A) | `student_4` Emma Miller, 8 |
| `parent_5` Eva Green (User B) | `student_5` Noah Green, 10 |
| `parent_6` Frank Fail | `student_6` Fail Child, 8 |

Classes: `class_available` (Science, 0/4 confirmed), `class_almost_full` (Math, 3/4 confirmed, **race target** with `booking_seed_1..3`).

Statuses: Booking `pending_payment | confirmed | payment_failed | cancelled`, PaymentAttempt `success | failed` + `failureReason: card_declined | class_overbooked_refunded`.

## Endpoints

| Method | Path | Body | Success | Error |
|---|---|---|---|---|
| GET | `/api/parents` | — | 200 `{ success, parents[] { id, students[] } }` | — |
| GET | `/api/trial-classes` | — | 200 `{ success, classes[] { id, confirmedCount, availableSeats } }` | — |
| GET | `/api/roster?classId=xxx` | — | 200 `{ success, roster { maxCapacity, confirmedCount, roster[] } }` | 400 `classId required`, 404 `Trial class not found` |
| POST | `/api/bookings` | `{ parentId, studentId, trialClassId }` | 200 `{ success, booking { status: pending_payment } }` | 400 missing fields / 409 `DUPLICATE_BOOKING` / 400 `Student does not belong…` |
| POST | `/api/bookings/:id/confirm` | `{ forcePaymentFailure?, amount? }` | 200 `{ success, reason, booking, payment }` | 400 `Booking not found` / `Invalid booking status…` |
| POST | `/api/bookings/:id/cancel` | `{ parentId }` | 200 `{ success, booking { status: cancelled } }` | 400 `parentId required` / `Not authorized` / `Cannot cancel…` |

## Examples (copy to Postman)

### 1. GET parents
```bash
curl http://localhost:3000/api/parents
```
Response `200`:
```json
{ "success": true, "parents": [{ "id": "parent_4", "name": "David Miller (User A)", "students": [{ "id": "student_4" }] }] }
```

### 2. GET trial classes
```bash
curl http://localhost:3000/api/trial-classes
```
Response shows `class_almost_full: 3/4`, `class_available: 0/4`.

### 3. GET roster
```bash
curl "http://localhost:3000/api/roster?classId=class_almost_full"
```
Response `200`:
```json
{ "success": true, "roster": { "classId": "class_almost_full", "maxCapacity": 4, "confirmedCount": 3, "roster": [{ "seatNumber": 1, "studentName": "Leo Smith" }] } }
```

### 4. POST create booking (happy — pending)
```bash
curl -X POST http://localhost:3000/api/bookings -H "Content-Type: application/json" -d "{\"parentId\":\"parent_4\",\"studentId\":\"student_4\",\"trialClassId\":\"class_available\"}"
```
`200` `{ "success": true, "booking": { "id": "...", "status": "pending_payment" } }`
Copy `booking.id` as `{{bookingId}}`.

Duplicate example (expect 409):
```bash
curl -X POST http://localhost:3000/api/bookings -H "Content-Type: application/json" -d "{\"parentId\":\"parent_1\",\"studentId\":\"student_1\",\"trialClassId\":\"class_almost_full\"}"
```
`409` `{ "success": false, "error": "DUPLICATE_BOOKING: Student Leo Smith already has an active booking (confirmed) for this class." }`

### 5. POST confirm (success)
```bash
curl -X POST http://localhost:3000/api/bookings/{{bookingId}}/confirm -H "Content-Type: application/json" -d "{}"
```
`200` `{ "success": true, "reason": "Booking confirmed successfully", "booking": { "status": "confirmed" }, "payment": { "status": "success" } }`

Payment failure (card_declined, not added to roster):
```bash
curl -X POST http://localhost:3000/api/bookings/{{bookingId}}/confirm -H "Content-Type: application/json" -d "{\"forcePaymentFailure\":true}"
```
`200` `{ "success": false, "reason": "Payment failed (card declined)", "booking": { "status": "payment_failed" }, "payment": { "status": "failed", "failureReason": "card_declined" } }`

Overbook (last-seat race, 4 already confirmed):
```json
{ "success": false, "reason": "Class full. Capacity cap of 4 reached. Payment refunded/failed.", "booking": { "status": "payment_failed" }, "payment": { "failureReason": "class_overbooked_refunded" } }
```

### 6. POST cancel (pending or confirmed only, requires parentId auth)
```bash
curl -X POST http://localhost:3000/api/bookings/{{bookingId}}/cancel -H "Content-Type: application/json" -d "{\"parentId\":\"parent_4\"}"
```
`200` `{ "success": true, "booking": { "status": "cancelled" } }`
- Roster `confirmedCount` drops by 1 (cancelled not counted).
- Re-`POST /api/bookings` same `parent_4/student_4/class` now succeeds (cancelled not active).
Errors: `400 parentId required`, `400 Not authorized to cancel this booking`, `400 Cannot cancel booking with status payment_failed|cancelled`.

## Full Flows

**A. Happy:** `POST /bookings` parent_4→class_available → `POST /confirm {}` → `GET /roster?classId=class_available` → 1 confirmed.

**B. Payment failure isolation:** same but `POST /confirm {forcePaymentFailure:true}` → `payment_failed`, roster stays 0.

**C. Duplicate block:** `POST /bookings` parent_1/student_1/class_almost_full → 409.

**D. Last-seat race (spec scenario):** reset `npx tsx prisma/seed.ts` (class_almost_full 3/4). `POST /bookings` parent_4/student_4/class_almost_full → A pending. `POST /bookings` parent_5/student_5/class_almost_full → B pending. `Promise.all` confirms `POST /bookings/A/confirm` + `POST /bookings/B/confirm` → exactly 1 `confirmed` 1 `class_overbooked_refunded`, `GET /roster` → 4/4. UI demo: `Last-Seat Race Demo` tab does same.

**E. Cancel + rebook:** `POST /bookings` parent_4/class_available → pending. `POST /cancel {parentId:parent_4}` → cancelled. `GET /roster` count unchanged (or -1 if was confirmed). `POST /bookings` same ids → succeeds.

## Postman

File: `postman/Ottodot.postman_collection.json` — Import → `Import → File` → select collection. Variable `{{baseUrl}}` = `http://localhost:3000`, `{{bookingId}}` auto-filled by `Create Booking` Tests script. Run folder top-to-bottom; reset DB via `npx tsx prisma/seed.ts` before Flows D/E.

Reset via CLI (no API): `npx tsx prisma/seed.ts` or UI `Reset Database & Seed` button (`actions.ts` `resetDatabaseAction` via `execSync`).
