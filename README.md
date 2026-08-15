# Fin Vault

Household and personal cash management for everyday use.

I built Fin Vault for personal use — to track my own spending, see where money goes, and keep clear analytics for household and personal cash. It is shared here so anyone can clone the repository and deploy their own instance.

Fin Vault keeps shared household finances and individual wallets in one place. Track balances, record income and spending, review day-by-day history, and understand spending patterns — with an Arabic-first interface and EGP as the default currency.

**Repository:** [github.com/iikareem/fin-vault](https://github.com/iikareem/fin-vault)

---

## Features

- **Dual ledgers** — separate books for household cash and each member’s personal money
- **Wallets** — current and savings accounts per ledger
- **Transactions** — income, expenses, allowances, and reimbursements
- **Spending categories** — purchases, food, clothing, transport, bills, and more
- **Daily history** — editable day-by-day activity
- **Analytics** — totals by day, category, and person
- **Charity tracking** — monthly contributions from household or personal cash

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js |
| Backend | NestJS |
| Database | PostgreSQL 16 |
| Local ports | Web `3000` · API `3001` · Postgres `5433` |

---

## Getting started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)

### 1. Configure environment

```bash
cp api/.env.example api/.env
```

Set a strong random value for `JWT_SECRET` in `api/.env`.

```bash
cp api/prisma/family.seed.example.json api/prisma/family.seed.json
```

Add household members (names, emails, passwords) to `family.seed.json`. This file is gitignored and must not be committed.

### 2. Start the database

```bash
docker compose up -d
```

### 3. Run the API

```bash
cd api
npm install
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

### 4. Run the web app

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with an email from your seed file.

Household membership is defined at seed time. Members are not added through the UI after seeding.

---

## Deployment (Railway)

Seed the production database **once**, after Postgres is available and before the first login. Seeding with example data first will block creation of your real household.

### Recommended: seed from your machine

Use the Railway Postgres `DATABASE_URL` locally so `family.seed.json` never leaves your computer:

```bash
cd api
DATABASE_URL='postgresql://…railway…' npx prisma migrate deploy
DATABASE_URL='postgresql://…railway…' npx prisma db seed
```

### Alternative: seed on Railway

1. Set `FAMILY_SEED` on the API service to the same JSON as `family.seed.json` (single line is fine).
2. Run a one-off command:

```bash
npx prisma migrate deploy && npx prisma db seed
```

3. Remove `FAMILY_SEED` after a successful seed.

Do not commit seed credentials or production secrets to GitHub.

---

## Private files

Never commit:

| File | Purpose |
| --- | --- |
| `api/.env` | Local secrets and database URL |
| `api/prisma/family.seed.json` | Real names, emails, and passwords |
| Other `.env` / `.env.local` files | Environment-specific secrets |

Use the `*.example` files as templates only.
