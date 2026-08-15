# Family Budget

I built this for my own daily household money tracking — cash on hand, spending, and a simple day-by-day history. It is a personal app, not a product.

The UI is Arabic-first (RTL). Currency defaults to EGP.

## Stack

- PostgreSQL (Docker, port 5433)
- NestJS API on port 3001
- Next.js app on port 3000

## What it tracks

- House money and personal money (current + savings)
- Income, expenses, and allowances
- Day-by-day history
- Month totals by day, category, and person
- Informal loans between people (no cash movement)
- Charity spending from personal current cash

## Run locally

```bash
cp api/.env.example api/.env
# set a long random JWT_SECRET in api/.env

cp api/prisma/family.seed.example.json api/prisma/family.seed.json
# put your own names, emails, and passwords in that file (it is gitignored)

docker compose up -d
cd api
npm install
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

In another terminal:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000 and sign in with an email from your seed file.

Household size comes from `family.seed.json`. The app does not let people add members after seed.

## Private files (do not commit)

- `api/.env` and any other `.env` / `.env.local`
- `api/prisma/family.seed.json` — real names, emails, and passwords

Use the `*.example` files as templates.
