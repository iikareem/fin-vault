# Fin Vault

**A bilingual, self-hostable personal finance app for everyday money management.**

[![Live App](https://img.shields.io/badge/Live_App-Open-0f766e?style=flat-square)](https://personal-budget-calc.up.railway.app)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-e0234e?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Fin Vault brings wallets, spending, income, savings goals, commitments, loans, monthly limits, analytics, and offline spend logging into one private workspace. It is English-first, includes full Arabic and RTL support, and is designed to run locally or as a production deployment.

[Open the live app](https://personal-budget-calc.up.railway.app) ·
[Create an account](https://personal-budget-calc.up.railway.app/register) ·
[Report an issue](https://github.com/iikareem/fin-vault/issues)

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Technology](#technology)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Production deployment](#production-deployment)
- [Development commands](#development-commands)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Features

- **Personal wallets** — manage current and savings balances independently.
- **Transaction tracking** — record income, expenses, transfers, and track-only entries.
- **Daily history** — review and edit activity by date.
- **Analytics** — understand cash flow and spending by period and category.
- **Flexible categories** — organize transactions with editable categories and subcategories.
- **Monthly spend and save limits** — set a soft save target or spend allowance for the current budget period, with progress on Home.
- **Custom budget month** — choose which calendar day your personal month starts on.
- **Savings goals** — allocate savings toward named targets.
- **Commitments** — manage subscriptions, installments, and recurring obligations.
- **Travel envelopes** — track trip spend against an optional limit.
- **Gold holdings** — record gold pieces and follow live EGP-per-gram quotes.
- **Outside loans** — track money lent to people who do not use the app.
- **Private balances** — hide sensitive totals without leaving the page.
- **Offline PWA** — install on supported phones; when offline, view the last-known balance and queue new spends that sync when you are back online.
- **Bilingual interface** — English by default, with Arabic and RTL support.
- **Self-service accounts** — registration creates a ready-to-use personal workspace.
- **Themes and appearance** — pick a visual theme and compact or privacy-minded UI prefs.

## Architecture

Fin Vault is a TypeScript monorepo with separate web and API services:

```text
Browser
   │
   │ /api/*
   ▼
Next.js web service
   │
   │ API_ORIGIN
   ▼
NestJS API
   │
   ▼
PostgreSQL
```

The Next.js route handler proxies browser requests to the API. This keeps authentication same-origin in production while allowing the web and API services to deploy independently. Prisma manages the database schema and migrations.

```text
fin-vault/
├── api/
│   ├── prisma/             # Schema, migrations, and development seeds
│   ├── src/                # NestJS modules and application logic
│   └── railway.toml        # API deployment configuration
├── web/
│   ├── public/             # Icons and static assets
│   ├── src/app/            # App Router pages and API proxy
│   ├── src/components/     # Shared interface components
│   ├── src/lib/            # API client, i18n, and utilities
│   └── railway.toml        # Web deployment configuration
├── docker-compose.yml      # Local PostgreSQL service
└── package.json            # Root convenience scripts
```

## Technology

| Layer | Technology |
| --- | --- |
| Web | Next.js 15, React 19, Tailwind CSS 4 |
| API | NestJS 11, Passport JWT, class-validator |
| Data | PostgreSQL 16, Prisma 6 |
| Authentication | HTTP-only JWT session cookie |
| Offline | Service worker, IndexedDB spend queue, cached session/balance |
| Testing | Jest, Supertest |
| Deployment | Railway, Nixpacks |

## Getting started

### Requirements

- Node.js 20.9 or newer
- npm
- Docker with Docker Compose

### 1. Clone the repository

```bash
git clone https://github.com/iikareem/fin-vault.git
cd fin-vault
```

### 2. Create local environment files

```bash
cp api/.env.example api/.env
cp web/.env.example web/.env.local
```

Replace the example `JWT_SECRET` in `api/.env` with a long, random value.

### 3. Start PostgreSQL

```bash
npm run db:up
```

The development database is exposed on `localhost:5433`.

### 4. Install dependencies and prepare the database

```bash
npm install --prefix api
npm install --prefix web
npm exec --prefix api -- prisma migrate deploy
```

### 5. Start the application

Run the API and web app in separate terminals:

```bash
npm run api
```

```bash
npm run web
```

Open [http://localhost:3000](http://localhost:3000), create an account at `/register`, and sign in. Registration automatically creates the user's personal workspace and default categories.

## Configuration

### API

Configure these values in `api/.env`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Signs authentication tokens |
| `PORT` | No | `3001` | API listening port |
| `WEB_ORIGIN` | Yes | `http://localhost:3000` | Allowed browser origin for CORS |

### Web

Configure these values in `web/.env.local`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | No | `/api` | Browser-facing API path |
| `API_ORIGIN` | No | `http://localhost:3001` | Server-side API origin used by the proxy |

Keep `NEXT_PUBLIC_API_URL=/api` for the standard same-origin production setup.

## Production deployment

The included Railway configuration supports three production resources:

1. **PostgreSQL** — stores application data.
2. **API service** — applies Prisma migrations and starts the compiled NestJS server.
3. **Web service** — serves the Next.js application and proxies requests to the API.

### Production variables

Set the following variables on the **API service**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL |
| `JWT_SECRET` | Unique production secret |
| `WEB_ORIGIN` | Public web origin, without a trailing slash |
| `PORT` | Platform-provided service port |

Set the following variables on the **web service**:

| Variable | Value |
| --- | --- |
| `API_ORIGIN` | Internal or private URL of the API service |
| `NEXT_PUBLIC_API_URL` | `/api` |

### Deployment checklist

- Provision PostgreSQL and connect `DATABASE_URL` to the API.
- Generate a production-only `JWT_SECRET`.
- Set `WEB_ORIGIN` to the exact public web origin.
- Point `API_ORIGIN` to the API service.
- Deploy the API; `npm run start:prod` applies pending migrations at startup.
- Deploy the web service and verify registration, login, and transaction creation.

The current public deployment is available at
[personal-budget-calc.up.railway.app](https://personal-budget-calc.up.railway.app).

## Development commands

| Command | Location | Description |
| --- | --- | --- |
| `npm run db:up` | repository root | Start local PostgreSQL |
| `npm run api` | repository root | Start the API in watch mode |
| `npm run web` | repository root | Start the Next.js development server |
| `npm run lint` | `api/` or `web/` | Run ESLint |
| `npm run build` | `api/` or `web/` | Create a production build |
| `npm test` | `api/` | Run API unit tests |
| `npm run test:e2e` | `api/` | Run API end-to-end tests |
| `npx prisma migrate dev --name <name>` | `api/` | Create a development migration |
| `npx prisma migrate deploy` | `api/` | Apply existing migrations |

## Contributing

Contributions are welcome when they are focused, tested, and consistent with the personal-finance scope of `main`.

### Recommended workflow

1. Fork the repository and create a branch from the latest `main`.
2. Use a descriptive branch name such as `feat/savings-chart` or `fix/login-timeout`.
3. Keep each pull request limited to one coherent change.
4. Add or update English and Arabic copy for user-facing features.
5. Add a Prisma migration for schema changes; never modify an applied migration.
6. Verify the affected workflow locally.
7. Run the checks below before opening a pull request:

```bash
cd api
npm run lint
npm test
npm run build

cd ../web
npm run lint
npm run build
```

A pull request should explain:

- what changed and why;
- how the change was tested;
- any database or environment changes;
- screenshots or recordings for visible interface changes.

Please do not commit secrets, generated build output, local environment files, or real financial data.

## Security

- Authentication uses an HTTP-only `fb_token` cookie.
- Production cookies are marked `secure` when `NODE_ENV=production`.
- CORS is restricted to `WEB_ORIGIN`.
- `JWT_SECRET` must be unique, private, and rotated if exposed.
- Environment files and production credentials must never be committed.

For a sensitive vulnerability, contact the repository owner privately instead of opening a public issue.

## License

No open-source license has been published for this repository. The source is available for evaluation and contribution, but no permission to copy, modify, or redistribute it is granted beyond applicable platform terms.
