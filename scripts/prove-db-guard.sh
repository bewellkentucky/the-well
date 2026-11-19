#!/usr/bin/env bash
# Proves the database guard refuses non-local / non-spotlight databases at
# every entry point: Prisma CLI, Next.js startup, the app's db client, seeds.
# Uses obviously fake URLs; nothing here can reach a real server because the
# guard throws before any connection is attempted.
set -u
cd "$(dirname "$0")/.."

REMOTE="postgresql://postgres:fake@db.not-a-real-host.supabase.co:5432/postgres"
WRONGNAME="postgresql://localhost:5432/postgres"
pass=0; fail=0

expect_refusal() {
  local label="$1"; shift
  local out
  out="$("$@" 2>&1)"
  if grep -q "spotlight db guard" <<<"$out"; then
    echo "REFUSED (good)  $label"
    pass=$((pass+1))
  else
    echo "NOT REFUSED (bad)  $label"
    echo "$out" | tail -5
    fail=$((fail+1))
  fi
}

expect_refusal "prisma db push, remote URL" env DATABASE_URL="$REMOTE" npx prisma db push --skip-generate
expect_refusal "prisma db push, local but wrong db name" env DATABASE_URL="$WRONGNAME" npx prisma db push --skip-generate
expect_refusal "prisma db push, local DATABASE_URL but remote DIRECT_URL" env DATABASE_URL="postgresql://localhost:5432/spotlight_dev" DIRECT_URL="$REMOTE" npx prisma db push --skip-generate
expect_refusal "next dev startup, remote URL" env DATABASE_URL="$REMOTE" perl -e "alarm shift; exec @ARGV" 60 npx next dev --port 3999
expect_refusal "app db client import, remote URL" env DATABASE_URL="$REMOTE" npx tsx -e 'import("./lib/db").then(()=>console.log("connected?!"))'
expect_refusal "seed script, remote URL" env DATABASE_URL="$REMOTE" npx tsx scripts/seed.ts
expect_refusal "table truncation script, remote URL" env DATABASE_URL="$REMOTE" npx tsx scripts/db-truncate.ts
expect_refusal "Vercel-looking env but VERCEL_ENV=development" env VERCEL=1 VERCEL_ENV=development DATABASE_URL="$REMOTE" npx tsx -e 'import("./lib/db").then(()=>console.log("connected?!"))'

echo
echo "$pass refused, $fail not refused"
[ "$fail" -eq 0 ]
