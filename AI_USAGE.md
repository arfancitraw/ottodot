# AI Usage Report

## 🛠️ AI Tools Used
- **Claude Code**: Terminal-based AI coding assistant.
- **Gemini Antigravity**: System architecture & pair-programming assistant.

---

## 💡 What AI Was Used For
1. **Architecture & Schema Design**: Drafting data models (`Parent`, `Student`, `TrialClass`, `Booking`, `PaymentAttempt`) and defining status lifecycle transitions.
2. **Boilerplate & Seed Generation**: Creating synthetic seed data covering all 4 required test cases (`prisma/seed.ts`).
3. **Vitest Concurrency Test Creation**: Formulating parallel `Promise.all()` test cases to rigorously verify race condition handling on the 4th seat.
4. **Full-stack UI Scaffold**: Generating a responsive Tailwind CSS single-page interface with interactive tabs for Parent Booking, Teacher Roster, and Race Condition Simulation.
5. **Documentation**: Structuring `README.md` and `AI_USAGE.md`.

---

## ⚡ Where AI Helped Move Faster
Generating the **Vitest test suite (`src/lib/booking-service.test.ts`)** and **Prisma seed script (`prisma/seed.ts`)**. Writing mock data structures and setting up async concurrency tests manually usually takes significant time; AI generated the exact boilerplate and data relations in seconds.

---

## 🧠 Where I Disagreed With, Corrected, or Rejected AI Output
1. **Atomic DB Transactions vs. Memory/Frontend Checks**: 
   - *Initial AI Suggestion*: The AI initially suggested checking seat availability in the API action before initiating a payment.
   - *My Correction*: I rejected this because a simple pre-check outside a transaction creates a Time-of-Check to Time-of-Use (TOCTOU) race condition window. I enforced placing the capacity check **inside a `prisma.$transaction`** during payment confirmation to ensure strict serializability.
2. **Prisma Field Naming**:
   - Corrected snake_case argument (`failure_reason`) to match the Prisma schema camelCase field (`failureReason`).

---

## 🔄 Workflow Adjustments for Next Time
I would write a complete `CLAUDE.md` specification file **before** asking the AI to write any code. Defining database field conventions and invariant rules upfront prevented schema mismatches and kept code generation 100% aligned with project constraints.

---

## ✅ Verification of Final Implementation
1. **Automated Vitest Tests**: Ran `npx vitest run` — all 4 test cases passed cleanly, including the concurrent `Promise.all()` race condition test.
2. **Production Build Check**: Ran `npm run build` — Next.js Turbopack compiled and generated static/dynamic routes with zero TypeScript or linting errors.
3. **Visual & Interactive Verification**: Ran `npm run dev` and tested all user flows (Parent selection, booking creation, mock payment success/decline, Roster view, and the Last-Seat Race Demo simulator) directly in the browser interface.
