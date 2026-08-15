# Fin Vault

**Fin Vault** (مال البيت) is a private household cash app — house money and personal money in one place.

Built for daily family use: what’s on hand, what was spent, and a clear day-by-day story. Arabic-first (RTL). Currency defaults to EGP.

> Personal app, not a product.

## What it does

- **Two money spaces:** house books and each person’s own cash
- **Wallets:** current + savings
- **Moves:** income, spending, allowances, and paybacks
- **Spending types:** purchases (مشتريات), food, clothes, transport, bills, and more
- **History:** day-by-day list you can edit
- **Reports:** totals by day, category, and person
- **Between us:** loans between family members
- **Charity:** monthly mosque / zakat tracking from house or personal cash

## Stack

| Layer | Tech |
|--------|------|
| Web | Next.js (port 3000) |
| API | NestJS (port 3001) |
| Database | PostgreSQL (Docker, port 5433) |

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

Open [http://localhost:3000](http://localhost:3000) and sign in with an email from your seed file.

Household size comes from `family.seed.json`. Members are not added from the UI after seed.

## Seed on Railway

Do this **once**, after Postgres exists and before anyone logs in. If the example family is seeded first, your real people will not be created.

**Safer (from your laptop):** copy the Railway Postgres `DATABASE_URL` into the command. Your gitignored `family.seed.json` stays on your machine.

```bash
cd api
DATABASE_URL='postgresql://…railway…' npx prisma migrate deploy
DATABASE_URL='postgresql://…railway…' npx prisma db seed
```

**On Railway:** add a variable `FAMILY_SEED` on the API service. Paste the same JSON as `family.seed.json` (one line is fine). Then run a one-off:

```bash
npx prisma migrate deploy && npx prisma db seed
```

After it succeeds you can delete `FAMILY_SEED` from Railway. Existing logins stay. Do not put that JSON in GitHub.

## Private files (do not commit)

- `api/.env` and any other `.env` / `.env.local`
- `api/prisma/family.seed.json` — real names, emails, and passwords

Use the `*.example` files as templates.

## Rename this GitHub repo

To match the project name, rename the repository to **`fin-vault`**:

**GitHub → Settings → General → Repository name → `fin-vault` → Rename**

Old links redirect automatically. Update Railway / deploy remotes if they still point at `family-budget`.
