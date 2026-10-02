# Fin Vault

Personal cash management for everyday use.

Track balances, record income and spending, review day-by-day history, set goals and commitments, and understand where your money goes — English by default, with Arabic available, and EGP as the default currency.

| | |
| --- | --- |
| **Live app** | [https://personal-budget-calc.up.railway.app](https://personal-budget-calc.up.railway.app) |
| **Source** | [https://github.com/iikareem/fin-vault](https://github.com/iikareem/fin-vault) |

Create an account at [/register](https://personal-budget-calc.up.railway.app/register), or clone the repository and run your own instance.

---

## Features

- **Personal ledger** — your own cash books and wallets
- **Wallets** — current and savings accounts
- **Transactions** — income, expenses, and transfers
- **Categories** — purchases, food, clothing, transport, bills, and more
- **Daily history** — editable day-by-day activity
- **Analytics** — totals by day and category
- **Goals & commitments** — targets and recurring obligations
- **Self-serve signup** — registration seeds a personal space automatically

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js (`web/`) |
| Backend | NestJS + Prisma (`api/`) |
| Database | PostgreSQL 16 |
| Local ports | Web `3000` · API `3001` · Postgres `5433` |

```text
fin-vault/
├── api/                 # NestJS API + Prisma
├── web/                 # Next.js frontend
├── docker-compose.yml   # Local PostgreSQL
└── package.json         # Root scripts
```

---

## Quick start

**Requirements:** Node.js 20+, Docker

```bash
# 1. Environment
cp api/.env.example api/.env
# Set a strong JWT_SECRET in api/.env

# 2. Database
docker compose up -d

# 3. API
cd api
npm install
npx prisma migrate deploy
npm run start:dev

# 4. Web (new terminal)
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), register at `/register`, then sign in.

---

## Deploy your own

Typical setup (e.g. Railway):

1. Provision PostgreSQL and set `DATABASE_URL`, `JWT_SECRET`, and `WEB_ORIGIN` on the API.
2. Run migrations once:

```bash
cd api
DATABASE_URL='postgresql://…' npx prisma migrate deploy
```

3. Deploy the API and web services. Users create accounts via `/register` — no seed file is required.

Do not commit credentials or production secrets.

---

## Private files

Never commit:

| File | Purpose |
| --- | --- |
| `api/.env` | Local secrets and database URL |
| Other `.env` / `.env.local` files | Environment-specific secrets |

Use the `*.example` files as templates only.
