# Fin Vault

Personal cash management for everyday use.

I built Fin Vault to track my own spending, see where money goes, and keep clear analytics on personal cash. It is shared here so anyone can clone the repository and run their own instance.

This project is a **monorepo**: the NestJS API (`api/`) and the Next.js web app (`web/`) live in one repository and share a single Postgres database.

Track balances, record income and spending, review day-by-day history, set goals and commitments, and understand spending patterns — with an Arabic-first interface and EGP as the default currency.

---

## Repository structure

```text
fin-vault/
├── api/                 # NestJS API + Prisma
├── web/                 # Next.js frontend
├── docker-compose.yml   # Local PostgreSQL
└── package.json         # Root scripts for api / web / db
```

---

## Features

- **Personal ledger** — your own cash books and wallets
- **Wallets** — current and savings accounts
- **Transactions** — income, expenses, and transfers
- **Spending categories** — purchases, food, clothing, transport, bills, and more
- **Daily history** — editable day-by-day activity
- **Analytics** — totals by day and category
- **Goals & commitments** — track targets and recurring obligations
- **Registration** — create an account in the app; personal books are seeded automatically

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Monorepo | `api/` + `web/` in one repository |
| Frontend | Next.js (`web/`) |
| Backend | NestJS + Prisma (`api/`) |
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

### 2. Start the database

```bash
docker compose up -d
```

### 3. Run the API

```bash
cd api
npm install
npx prisma migrate deploy
npm run start:dev
```

### 4. Run the web app

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account at **/register**, then sign in.

---

## Deployment (Railway)

1. Provision Postgres and set `DATABASE_URL`, `JWT_SECRET`, and `WEB_ORIGIN` on the API service.
2. Run migrations once:

```bash
cd api
DATABASE_URL='postgresql://…railway…' npx prisma migrate deploy
```

3. Deploy the API and web app. Users create accounts through **/register** — no seed file is required for personal use.

Do not commit credentials or production secrets to GitHub.

---

## Private files

Never commit:

| File | Purpose |
| --- | --- |
| `api/.env` | Local secrets and database URL |
| Other `.env` / `.env.local` files | Environment-specific secrets |

Use the `*.example` files as templates only.
