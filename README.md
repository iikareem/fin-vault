# Fin Vault

Personal cash management you can self-host.

Fin Vault is a production web app for tracking personal wallets, income and spending, day-by-day history, analytics, savings goals, and recurring commitments. The interface defaults to English (LTR) with Arabic (RTL) available. Default currency is EGP.

| | |
| --- | --- |
| **Production** | [https://personal-budget-calc.up.railway.app](https://personal-budget-calc.up.railway.app) |
| **Repository** | [https://github.com/iikareem/fin-vault](https://github.com/iikareem/fin-vault) |
| **Register** | [Create an account](https://personal-budget-calc.up.railway.app/register) |

This repository is a monorepo: NestJS API (`api/`), Next.js frontend (`web/`), and PostgreSQL.

---

## What it does

- Personal cash ledger with current and savings wallets
- Income, expense, transfer, and track-only entries
- Editable day history and category-based analytics
- Savings goals and recurring commitments (subscriptions / installments)
- Outside loans to people not in the app
- Public registration that seeds a personal space for each new user
- Cookie-based JWT sessions (`fb_token`)
- Bilingual UI (English default, Arabic optional)

> **Note:** `main` ships the personal product only (`HOUSE_BOOKS_ENABLED = false`). Household books live on the `house-books` branch and are not part of the public personal app.

---

## Architecture

```text
Browser (web :3000)
    │  NEXT_PUBLIC_API_URL=/api
    ▼
Next.js route handler  web/src/app/api/[...path]
    │  API_ORIGIN → Nest API
    ▼
NestJS API (api :3001)  ──►  PostgreSQL 16
```

- The web app proxies `/api/*` to the Nest service so the browser stays same-origin for cookies in production.
- CORS on the API allows only `WEB_ORIGIN` and uses `credentials: true`.
- Prisma owns the schema and migrations under `api/prisma/`.

### Repository layout

```text
fin-vault/
├── api/                      # NestJS + Prisma
│   ├── prisma/               # schema, migrations, optional seeds
│   ├── src/                  # auth, households, transactions, …
│   └── railway.toml
├── web/                      # Next.js App Router + Tailwind
│   ├── src/app/              # pages and /api proxy
│   ├── src/components/
│   ├── src/lib/              # api client, i18n, features
│   └── railway.toml
├── docker-compose.yml        # local Postgres on host port 5433
└── package.json              # convenience scripts
```

---

## Stack

| Area | Choice |
| --- | --- |
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Backend | NestJS 11, Passport JWT, class-validator |
| ORM / DB | Prisma 6, PostgreSQL 16 |
| Auth | Register + login, httpOnly cookie session |
| Local ports | Web `3000` · API `3001` · Postgres `5433` |
| Deploy | Railway (Nixpacks), see `*/railway.toml` |

---

## Prerequisites

- Node.js **20.9+**
- npm
- Docker (for local PostgreSQL)

---

## Local development

### 1. Clone and configure

```bash
git clone https://github.com/iikareem/fin-vault.git
cd fin-vault

cp api/.env.example api/.env
cp web/.env.example web/.env.local
```

Edit `api/.env` and set a strong `JWT_SECRET`.

#### API environment (`api/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | Signing secret for session tokens |
| `PORT` | no | API listen port (default `3001`) |
| `WEB_ORIGIN` | yes | Frontend origin for CORS (local: `http://localhost:3000`) |

#### Web environment (`web/.env.local`)

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | no | Browser API base (default `/api`) |
| `API_ORIGIN` | no | Server-side Nest origin (default `http://localhost:3001`) |

### 2. Start Postgres

```bash
docker compose up -d
# or: npm run db:up
```

### 3. Run the API

```bash
cd api
npm install
npx prisma migrate deploy
npm run start:dev
```

API: [http://localhost:3001](http://localhost:3001)

### 4. Run the web app

```bash
cd web
npm install
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

Register at `/register`, then sign in. Registration creates the user and seeds personal books automatically — no household seed file is required on `main`.

### Useful scripts

| Command | Where | Purpose |
| --- | --- | --- |
| `npm run db:up` | repo root | Start Postgres via Docker |
| `npm run start:dev` | `api/` | API with watch mode |
| `npm run dev` | `web/` | Next.js dev server |
| `npx prisma migrate deploy` | `api/` | Apply migrations |
| `npx prisma migrate dev` | `api/` | Create a migration while developing |
| `npm run lint` | `api/` or `web/` | ESLint |
| `npm test` | `api/` | Jest unit tests |
| `npm run build` | `api/` or `web/` | Production build |

---

## Production deployment

The public instance runs on Railway as two services plus Postgres:

1. **Postgres** — managed database; provide `DATABASE_URL` to the API.
2. **API** — builds with Prisma generate + Nest build; starts with `npm run start:prod` (runs `prisma migrate deploy` then `node dist/main.js`).
3. **WEB** — Next.js build; starts with `npx next start --hostname ::`. Set `API_ORIGIN` to the private/internal API URL Railway gives the API service.

### Required production variables

**API**

| Variable | Example / notes |
| --- | --- |
| `DATABASE_URL` | Railway Postgres URL |
| `JWT_SECRET` | Long random secret; never commit |
| `WEB_ORIGIN` | Public web URL, e.g. `https://personal-budget-calc.up.railway.app` |
| `PORT` | Usually set by the platform |

**WEB**

| Variable | Example / notes |
| --- | --- |
| `API_ORIGIN` | Internal API base URL used by the `/api` proxy |
| `NEXT_PUBLIC_API_URL` | Keep `/api` so the browser talks to the Next proxy |

### First deploy checklist

1. Create Postgres and wire `DATABASE_URL` into the API service.
2. Set `JWT_SECRET` and `WEB_ORIGIN` on the API.
3. Set `API_ORIGIN` on the web service.
4. Deploy API (migrations run on start via `start:prod`).
5. Deploy web and open the public domain.
6. Create the first account at `/register`.

Do not commit `.env`, `.env.local`, production URLs with secrets, or seed credentials.

---

## Contributing

Contributions that improve the personal product on `main` are welcome. For household/house-books work, use the `house-books` branch.

### Workflow

1. Fork the repository (or create a branch from latest `main`).
2. Create a focused branch: `feat/…`, `fix/…`, or `docs/…`.
3. Keep changes scoped — prefer small PRs over large mixed ones.
4. Run the local stack and exercise the flow you changed (register / login / add / history / analytics as relevant).
5. Lint and build before opening a PR:

```bash
cd api && npm run lint && npm run build
cd ../web && npm run lint && npm run build
```

6. Open a pull request against `main` with:
   - **What** changed
   - **Why** it is needed
   - **How** you verified it (steps or screenshots for UI)

### Guidelines

- Match existing TypeScript, Nest, and Next.js patterns in the folders you touch.
- Prefer clear, product-facing copy in both English and Arabic when you add UI strings (`web/src/lib/i18n.ts`).
- Do not enable house books on `main` unless the change is explicitly about that feature flag and discussed in the PR.
- Never commit secrets, real seed data, or local env files.
- Database changes go through Prisma migrations in `api/prisma/migrations/` — do not edit applied migrations.

### Reporting issues

Open a GitHub issue with:

- Expected vs actual behavior
- Steps to reproduce
- Environment (production URL vs local, browser, approx. commit/date)

---

## Security

- Sessions use an httpOnly cookie (`fb_token`); `secure` is enabled when `NODE_ENV=production`.
- Keep `JWT_SECRET` unique per environment and rotate if leaked.
- Restrict `WEB_ORIGIN` to the real frontend origin in production.
- Treat `api/.env` and `web/.env.local` as private; only `*.example` files belong in git.

---

## License

The API package is marked `UNLICENSED` in `package.json`. Unless a license file is added, treat the project as source-available for personal use and contribution via pull request — do not assume redistribution rights beyond what GitHub’s terms and the repository settings allow.
