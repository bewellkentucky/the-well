# Spotlight: Project Context for Claude Code

Read automatically by Claude Code. Keep it current: when a decision changes or a
gotcha is hit, update this file in the same piece of work.

## What this is

**Spotlight** is a peer-recognition app (formerly "The Well", built for Be Well
Kentucky, which has closed). Staff give each other **kudos** tied to company
values. Kudos carry **stars** (shown `25 ⭐`), which people redeem for rewards.
People also earn stars through **incentives**.

Spotlight is **multi-tenant** and may be sold to other companies as SaaS. It is
its own codebase. The first customer is **LCED** (Louisville Center for Eating
Disorders). LCED staff email is moving to `lcedky.com`, with `bewellkentucky.com`
kept as an alias; both domains sign in to LCED.

## Tech stack

Next.js 16 (App Router) + TypeScript · Auth.js v5 (Google) · Postgres (Supabase
in production) · Prisma 7 with `@prisma/adapter-pg` · Vercel · vitest.
No email provider in v1 (Resend removed). PWA, no app store.

## Local development (read before running anything)

- **Database guard (`lib/dbGuard.ts`).** Off Vercel, the app, Prisma CLI, seeds,
  scripts and tests refuse to run unless `DATABASE_URL` (and `DIRECT_URL`)
  point at `localhost` and a database named `spotlight_dev` or
  `spotlight_test`. It steps aside only on real Vercel production/preview
  (`VERCEL=1` + `VERCEL_ENV`). `npm run db:guard:prove` demonstrates refusal at
  every entry point. Never weaken this.
- Local settings live in `.env.development.local` (dev) and `.env.test.local`
  (tests). Both are git-ignored. **`.env.local` holds production values and must
  not be used**; `.env.development.local` overrides every key it defines.
  `prisma.config.ts` loads `.env.development.local` (or `SPOTLIGHT_ENV_FILE`).
- Dev server: `npm run dev` (port **3100**; 3000 is used by another project on
  this machine). `next.config.ts` pins `turbopack.root`; without it a
  `package-lock.json` in the home folder made Turbopack spawn thousands of
  PostCSS workers and exhaust the process table. If the dev overlay says
  "stale" or throws odd JSON/manifest errors, stop the server and delete `.next`.
- Schema changes locally: `npm run db:push`. Reset local data: `npm run db:reset`
  (truncates, pushes, seeds fictional data). Prisma refuses `--force-reset` when
  an AI agent runs it; do not set its consent override. The harness truncates
  instead.
- Local sign-in: `SPOTLIGHT_DEV_LOGIN=1` shows a "sign in as" picker of seeded
  people on the sign-in page (`lib/devLogin.ts`: only under `next dev`, not on
  Vercel, only with the guard passing). `scripts/dev-session.ts <email>` prints
  a session cookie for curl/headless smoke tests.
- Seed data is fictional only: "Harborlight Counseling" (`harborlight.test`)
  and LCED with made-up people. Never put real staff in seeds or tests.
- Tests: `npm test` (vitest against `spotlight_test`; files run serially).

## Multi-tenancy (the rules)

- Every tenant table has `companyId`. Composite foreign keys
  `(childId, companyId) -> parent(id, companyId)` make the database refuse rows
  that link two companies.
- **All tenant data access goes through `requireActor().db` /
  `scopedDb(companyId)`** (`lib/tenant.ts`, `lib/scopedDb.ts`). The extension
  forces `companyId` into every `where` and every create; updates can't move a
  row to another company; unknown operations on tenant models throw.
- `requireActor()` re-reads the person (company, role, active, company active)
  from the DB on every action/page. The session is identity only. Never take a
  companyId from the client.
- **Raw SQL is not scoped.** Any `$queryRaw`/`$executeRaw` must filter on
  `companyId` by hand.
- The unscoped `db` may only be imported by files on the allowlist in
  `tests/unscoped-db.test.ts` (identity, platform, cron, seed). Adding a file
  there needs a reason.
- Company settings are columns on `Company`: name, `shortName` (shown under
  "Spotlight" on phones and on the phone sign-in page; LCED = "LCED"; null
  falls back to name; 24 characters max), `appUrl` (company address,
  e.g. `https://spotlight.louisvillecenterforeatingdisorders.com`), `logoUrl`,
  `brandColor`, `allowanceAmount`, `featuredIncentiveCount`, BambooHR settings,
  `chatSpace`. There is no global settings table any more.
- Sign-in (`lib/signIn.ts`): Google `email_verified` + `hd` claim must map
  through `CompanyDomain` to an active company. Match by Google `sub` first,
  then email, so a primary-email change (bewellkentucky.com -> lcedky.com) keeps
  the same row. A person can never move companies by signing in. Inactive people
  and companies are refused. Domains are unique across companies.
- Roles: `member` (default) and `admin` per company (approvals, rewards,
  incentives, balance adjustments, program settings, branding).
  `isPlatformOwner` (set by SQL only) sees `/platform`, manages companies and
  domains, and is the only one who can change roles. A company can't lose its
  last admin. **Role changes stay platform-owner-only for now (decided
  2026-11-19). When a second customer exists, give company admins the ability
  to change roles within their own company** (scoped `changeRole`, still
  guarded by the last-admin rule, plus a tenant test).
- `User.lastSignInAt` is set on every successful Google sign-in
  (`lib/signIn.ts`). The old app never stored it, so it is null for everyone
  until their first sign-in after the Spotlight deploy.
- Branding: a validated `#rrggbb` replaces the `--accent` CSS variable
  (`lib/branding.ts`); everything accent-derived uses `color-mix`. Logos must be
  https URLs. The sign-in page picks branding by request host vs `appUrl`.
- Tests in `tests/tenant.test.ts` try to read and write across companies and
  must fail. Add a case there for every new action or page query.

## Money logic (the rules)

Two pools, labeled everywhere: **giving allowance** (`givingBalance`, "To give
this month") and **earned wallet** (`balance`, "Earned · yours to spend" /
"Your stars"). Never show a bare number without saying which pool.

Every action that moves stars (`lib/money.ts`):
1. one interactive transaction (`MONEY_TX` timeouts);
2. `lockUsers()` first: `SELECT ... FOR UPDATE` on every user row touched, in id
   order, filtered by companyId;
3. re-read and validate after the lock (allowance, wallet, caps, inventory);
4. status changes via conditional `updateMany(... status: "pending")`,
   requiring `count === 1`;
5. audit row inside the same transaction. Never log kudo message text.

Postgres runs Prisma transactions at READ COMMITTED: re-reading inside a
transaction without a row lock does **not** prevent double-spend (a mutation
test removing the lock lets 10/10 concurrent kudos through). Keep the locks.

Error handling: throw `ActionError` for user-facing messages; `toActionError`
replaces anything else (Prisma, network) with a generic message.

- Kudos: allowance -> recipient's wallet. Can't send to yourself or to someone
  inactive or in another company. `isPrivate` fails safe to private.
- **Pile on** (was "Make it rain"; label lives in `PILE_ON_LABEL`, button
  `Pile on +5 ⭐`, never "Me too"): +5 per tap, max 5 taps staged client-side,
  one commit; 25 per person per kudo (sum of `PileOn` rows, one row per
  commit); allowance -> recipient's wallet; counts toward Top givers; blocked
  for the recipient, the original giver and private kudos. A solid accent pill
  on its own row, visually distinct from the outlined ⭐ reaction chip.
- Incentives: one rules module `lib/incentives.ts` for server and UI.
  `unlimited` never blocks (even with a pending claim); `once` / `monthly` /
  `quarterly` lock within the period; declined claims don't count; unknown caps
  fail closed; windows are inclusive. Approval credits `rewardSnapshot`.
- Rewards: wallet and inventory checked under lock; declining a redemption
  refunds the snapshot `cost` exactly once and restocks limited inventory.
- Allowance reset (`lib/allowanceReset.ts`, cron on the 1st): per company, its
  own amount, writes `AllowanceReset` ledger rows; never touches `balance`.

## Product decisions (don't relitigate without reason)

- Names: Spotlight; stars `⭐` (format with `formatStars()` in `lib/brand.ts`);
  ⭐ is the lead reaction. No food or body references in names or copy (LCED
  treats eating disorders). This includes CSS token names (`--accent`,
  `--canvas`, `--moss`, `--violet`, `--fern`) and seed catalog items.
- Exactly six values, verbatim: Compassion, Ownership, Curiosity, Team-First,
  Excellence, Above & Beyond (`COMPANY_VALUES` in `lib/brand.ts`).
- The leaderboard ranks **givers** (kudos + pile-ons), not receivers.
- Recognition UI is hierarchy-agnostic: no job titles in feed/leaderboard.
- Composer shows "No patient names or details". Never log message content.
- Public/private: public posts to the company's Chat space (if set); private is
  sender + recipient only and never touches Chat (`chatTarget()` gate).
- Incentive order is admin-set (move up/down) and used everywhere; Home features
  the top N (company setting, default 2).
- BambooHR is an optional, **read-only** connection per company: GET requests
  only; key in env `BAMBOOHR_API_KEY_<SLUG>`; skips employees whose email domain
  isn't the company's; Google creates/links people, Bamboo pre-creates and
  enriches (undefined, not null, for missing fields).
- Reward visual: emoji `icon` + `color` everywhere, `imageUrl` when present.
- Reward fulfillment (Tremendous/Printful) stays deferred until after the admin
  approval queue; redemptions only record + deduct.
- Voice: warm, calm, human. No em dashes in user-facing text.
- HIPAA posture: not a PHI system. Free Vercel/Supabase tiers have no BAA.

## Google Chat

App is canonical; Chat is a surface. Chat users resolve to Spotlight users by
verified email on each interaction; never auto-create accounts from Chat. The
callback verifies Google's JWT (`CHAT_AUDIENCE`). Interactive pile-on from Chat
is not built; if built, it must reuse `pileOn`'s transaction and never trust
button payloads. One-way posting uses the service account in `GCHAT_SA_KEY` and
the company's `chatSpace`. Marketplace setup notes: private app, "Join spaces
and group conversations" enabled, don't add `chat.bot` on the SDK scopes page.

## Production database

- Supabase migrations: `prisma db push/migrate` hang on the original network.
  Hand-write SQL, run it in the Supabase SQL editor, then `npx prisma generate`.
- `prisma/sql/2026-11-19-spotlight-multitenant.sql` converts the single-tenant
  production DB (not yet run). Rehearsed locally; after it, `prisma migrate
  diff` shows only `AppSetting`, `BalanceAdjustment`, `User.entity`, which are
  deliberately left for later cleanup.
- `prisma/sql/2026-11-19-spotlight-lced-fresh-start.sql` runs right after it
  (not yet run): LCED only, one transaction, deletes activity (kudos,
  reactions, pile-ons, claims, redemptions, old balance adjustments), sets
  allowances to the company amount and earned wallets to 0, writes audit and
  AllowanceReset rows. It has a people list (query B) for choosing who to
  deactivate by hand; run that before the reset. It deactivates nobody.
- Prisma 7: connection URLs live in `prisma.config.ts`, not `schema.prisma`.
- "use server" files may export async functions only (types are fine).
- Kudo seeding on render is gone for good; empty feed shows "No kudos yet. Be
  the first to recognize someone."
- Orphan users: `googleId IS NULL AND bambooId IS NULL`. Never delete by
  `googleId IS NULL` alone (Bamboo pre-creates rows).
- Deactivate, never delete, people.

## Deploying (by hand, later)

See `reports/2026-11-19-spotlight-plan.md` §7 for the GitHub/Vercel/Supabase/
Google rename steps and env changes (`ALLOWED_EMAIL_DOMAIN` and Resend vars
removed; `BAMBOOHR_API_KEY_LCED`; `CRON_SECRET`). The keep-warm cron runs every
5 minutes and needs Vercel Pro.

## How to help

Ask before introducing a dependency or changing a decided architecture choice.
Expand and read money-logic diffs before pushing, and confirm the Vercel build
is green after deploying. `prototype/` and `docs/` describe the old single-tenant
The Well; treat them as history, not spec.
