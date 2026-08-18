# Fin Vault — AI Handoff Context

This document is a fast, practical context handoff so another AI model can continue work without re-discovering the project.

---

## 1) Project overview

**Fin Vault** is a household finance tracker with two money spaces:

- **HOUSE**: shared family money
- **PERSONAL**: each member’s own money book

Primary goals:

- track daily income/expense
- track claims/covers between person and house
- track peer loans between family members
- keep UI simple for Arabic-first usage

Repo structure:

- `api/` → NestJS + Prisma + PostgreSQL
- `web/` → Next.js App Router + TypeScript

---

## 2) Architecture map

### Backend (`api/`)

- `src/auth/*` authentication/session
- `src/households/*` membership + role checks + defaults
- `src/accounts/*` balances and transfers
- `src/transactions/*` ledger transactions
- `src/analytics/*` home summary + day logs
- `src/claims/*` pocket claims against house
- `src/covers/*` house covers for member (opposite direction)
- `src/loans/*` member-to-member loans
- `src/history/*` period history pages (with-house + between-members)
- `prisma/schema.prisma` data model
- `prisma/migrations/*` DB migrations

### Frontend (`web/`)

- `src/app/page.tsx` home dashboard
- `src/app/add/page.tsx` add transactions/claims/covers/etc.
- `src/app/history/page.tsx` day-level log
- `src/app/between/page.tsx` peer loans screen
- `src/app/between/history/page.tsx` peer history
- `src/app/with-house/page.tsx` member↔house history
- `src/lib/i18n.ts` translations and UI copy
- `src/lib/calendar.ts` date helpers and default sorting
- `src/components/BooksProvider.tsx` active space and user context

---

## 3) Core domain behavior

### A) Transactions

`Transaction` is the ledger source for balances and latest/day views.

- Balance is computed from `Transaction` (+ account opening)
- Home "latest" reads transactions
- Personal day log shows transactions for selected date

### B) House Claim (member paid for house)

- Creates a `HouseClaim`
- Also creates linked personal **EXPENSE** tx (`personalTxId`)
- Reimbursements create house-side tx and personal **INCOME** tx

### C) House Cover (house paid for member)

- Creates a `HouseCover`
- Also creates linked house tx (`houseTxId`)
- Repayment creates linked house + personal tx as applicable

### D) Between members (PeerLoan)

Current intended behavior (after recent fixes):

- Creating a loan writes debt (`PeerLoan`) **and** personal-cash ledger:
  - lender personal **EXPENSE**
  - borrower personal **INCOME**
- Repayment writes:
  - borrower personal **EXPENSE**
  - lender personal **INCOME**
- Linked tx ids stored on loan / repayment rows.

---

## 4) Important recent UX decisions

- List rows use compact friendly date chip (`ItemDate`) with day/month style.
- Lists default sort by newest `occurredOn`.
- Non-admin in HOUSE cannot see house cash totals.
- Personal money amount is masked until tapped (eye icon).
- Home for admin is intentionally quieter (collapsed sections).

---

## 5) Data model highlights (Prisma)

Main tables:

- `Household`, `Membership`, `User`
- `Account`, `Category`, `Transaction`
- `HouseClaim`, `Reimbursement`
- `HouseCover`, `CoverRepayment`
- `PeerLoan`, `LoanRepayment`
- `HousePayout`, `CharityGift`, `CharityType`

Key relation principle:

- money movement must have ledger rows in `Transaction`
- business rows should link to those tx rows when possible

---

## 6) Existing migration notes

Recent migration added personal tx links for peer loans:

- `api/prisma/migrations/20260816101200_peer_loan_personal_tx/migration.sql`

This adds:

- `PeerLoan.fromPersonalTxId`, `PeerLoan.toPersonalTxId`
- `LoanRepayment.fromPersonalTxId`, `LoanRepayment.toPersonalTxId`

---

## 7) Existing-record compatibility note

Old peer loans (created before tx-link feature) can exist without linked personal transactions.

There is startup backfill logic in `api/src/loans/loans.service.ts` (module init) intended to fill missing personal tx links idempotently.

If users report old records still missing from balances/logs, first verify:

1. API restarted after deploy
2. migration applied successfully
3. backfill ran and completed without errors

---

## 8) How to run locally

From repo root:

```bash
npm install
npm run db:up
```

API:

```bash
cd api
npm run prisma:generate
npm run start:dev
```

Web:

```bash
cd web
npm run dev
```

---

## 9) High-risk areas when editing

1. **Cross-space accounting** (HOUSE vs PERSONAL)  
   Avoid accidental double-posting or missing counterpart tx.

2. **Date handling** (`occurredOn`)  
   Keep local-calendar semantics consistent between UI and API.

3. **Role guards**  
   HOUSE admin/member permissions are intentionally strict.

4. **Backfills / idempotency**  
   Startup repair logic must be safe to run more than once.

---

## 10) Recommended next checks for any AI taking over

1. Add/expand integration tests for:
   - peer loan create/repay creates correct personal tx rows
   - edit/delete loan keeps linked tx rows in sync
   - old rows backfill once, no duplicates

2. Confirm home + day views reflect backfilled records after restart.

3. Consider moving startup backfill into explicit one-time migration script if dataset grows large.

4. Keep `i18n` copy aligned with behavior whenever accounting rules change.

---

## 11) Quick glossary

- **Claim**: member paid for house, house owes member
- **Cover**: house paid for member, member owes house
- **Peer loan**: member-to-member debt
- **OccurredOn**: business date of event (not creation timestamp)

---

## 12) If you are the next AI

Start with these files in order:

1. `api/prisma/schema.prisma`
2. `api/src/loans/loans.service.ts`
3. `api/src/analytics/analytics.service.ts`
4. `web/src/app/page.tsx`
5. `web/src/app/between/page.tsx`
6. `web/src/lib/calendar.ts`
7. `web/src/lib/i18n.ts`

Then run typecheck/build before making behavioral changes.
