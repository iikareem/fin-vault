#!/bin/bash
set -euo pipefail
cd /Users/kareem/Projects/family-budget/api
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL first"
  exit 1
fi
echo "Seeding mock_user…"
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-mock-user.ts
echo
echo "Done."
