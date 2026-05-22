# The Well — Project Context for Claude Code

This file is read automatically by Claude Code. It captures everything about the
project so any session starts with full context. Keep it updated as decisions change.

## What this is

**The Well** is an internal employee recognition app for **Be Well Kentucky (BWK)**,
a behavioral health practice owned by Justin Wallen. Be Well Kentucky and **Louisville
Center for Eating Disorders (LCED)** are two related organizations that share one
Google Workspace domain (`@bewellkentucky.com`). ~28 staff total.

Staff give each other **kudos** (peer recognition) tied to company values. Kudos carry
**drops** (the in-app currency, symbol `d`), which staff redeem for rewards (swag, gift
cards, gifted PTO). Staff also earn drops through **incentives** (specific actions like
getting a Google review or a flu shot). It's like Bonusly/Nectar, but built specifically
for a small behavioral-health practice.

## Current state

There is a complete, working **HTML/JS prototype** at `prototype/the-well-prototype.html`
(~6000 lines, single file, mock data). It demonstrates every feature and is the source of
truth for product behavior and visual design.

**What's built and working in the real app:**
- Google OAuth sign-in (Auth.js v5), domain-locked to `@bewellkentucky.com`
- Supabase Postgres + Prisma schema (User, Kudo, Reaction, Reward, Redemption, AllowanceReset)
- User upsert on first sign-in (Google data → DB)
- Kudos feed (public + private visibility rules, reactions, optimistic UI)
- Kudo composer (recipient picker, value tags, drop amount, public/private toggle, server-side auth guard, balance deduction in a single transaction)
- Reactions: 10-emoji picker led by 💧, toggle on/off, persisted, optimistic UI
- Right sidebar: "This month" leaderboard (top givers), "Coming up" (birthdays + anniversaries, 60-day rolling window)
- Seed data for 10 staff users + 6 kudos, idempotent via stable IDs + upsert
- Navigation: 5 tabs (Feed `/`, Team `/team`, Rewards `/rewards`, Dates `/dates`, Earn `/earn`). Desktop: links in the TopNav header. Mobile: fixed bottom nav. Both use `usePathname()` from shared `NavLinks.tsx`. `PageShell` wraps every authenticated page.

## The build, in order

See `docs/build-plan.md` for the full spec. Summary of the intended path:

1. **Google auth** ✅ — OAuth client + Internal consent screen created; Auth.js v5 wired up.
2. **Next.js scaffold + auth** ✅ — App Router, domain-locked Google sign-in, user upsert.
3. **Postgres + Prisma** ✅ — Supabase DB, full schema, migrations applied.
4. **Feed, composer, reactions, sidebar** ✅ — Home page complete.
5. **Directory sync** (optional) — Google Workspace service account to pre-populate users.
6. **BambooHR integration** — HR enrichment (hire date, birthday, supervisor, entity,
   time-off). See `docs/bamboohr-integration.md`. Sidebar "Out today" card wires up here.
7. **Google Chat integration** — kudos posted to #kudos space + DMs. See `docs/chat-integration.md`.
8. **Reward fulfillment** — Tremendous (gift cards), Printful (swag), internal (PTO/CEU).
   See `docs/fulfillment-integration.md`.

## Tech stack (decided)

- **Next.js 15** (App Router) + TypeScript
- **Auth.js / NextAuth v5** with Google provider, `hd` + domain check locking to bewellkentucky.com
- **Postgres** on **Supabase** (free/Pro tier)
- **Prisma** ORM
- **Vercel** hosting (free/near-free at 28 users)
- **Resend** for the ~5 transactional emails (Chat handles most notifications)
- Production URL: **thewell.bewellkentucky.com**
- Local dev: localhost:3000

## Key product decisions (don't relitigate without reason)

- **Identity = Google Workspace. HR enrichment = BambooHR.** Join key: Bamboo `workEmail`
  = Google `primaryEmail`. Google CREATES users; Bamboo only UPDATES them (use `undefined`
  not `null` for missing Bamboo fields so data isn't wiped). Deactivate, never delete.
- **Currency is "drops" (symbol `d`).** NOT nectar, NOT a bee. The signature reaction emoji
  is the water droplet 💧 (ties to the well/drops metaphor). The product was briefly called
  "Honeycomb" with "nectar" — all of that is gone. Do not reintroduce bee/honey/nectar in
  user-facing text. (Note: internal CSS color variables are still named `--honey`/`--honey-deep`
  — those are just the sage-green palette names, never user-visible, fine to leave.)
- **Public/private kudo toggle.** Public (default) posts to #kudos + the feed. Private goes
  only to the recipient's DM, visible to sender + recipient + Owner only.
- **Entity field (BWK/LCED/Both) is back-office only.** Removed from the Feed and Team
  directory because staff overlap so much the distinction is meaningless for recognition.
  KEPT in Admin → Reports for cost attribution (which org's books a reward cost lands on).
- **Incentives** have two verification modes: self-attest (instant credit) and admin-verify
  (goes to an approvals queue; supports link + screenshot proof upload).
- **Reactions are NOT synced between the app and Google Chat** (v1). Two separate pools.
  See `docs/chat-integration.md` for the reasoning.
- **The sidebar leaderboard ranks GIVERS, not receivers.** This is deliberate: celebrating
  who gives the most recognition encourages generosity and avoids turning the feed into a
  popularity contest, which matters in a behavioral health setting. Do not flip this to
  receivers without explicit discussion.
- **Company values (exactly six, exact names):** Compassion, Ownership, Curiosity, Team-First, Excellence, Above & Beyond. Use these verbatim everywhere — in the composer, kudo cards, seed data, and any admin UI. Do not substitute synonyms or add new ones.
- **No app store.** It's a PWA — people add it to their home screen. App name "The Well".
- **Reward fulfillment is deferred.** Redeeming a reward currently records a `Redemption` row
  and deducts the user's `balance` — nothing else. No external API calls are made. The
  `Reward.provider` field (printful/tremendous/internal) and the `Redemption` status queue
  anticipate fulfillment but don't drive it yet. Fulfillment should come AFTER the admin
  portal (redemptions get reviewed and approved in an admin queue before any money moves).
  See `docs/fulfillment-integration.md` for the planned Tremendous + Printful wiring. Do not
  add Tremendous or Printful API calls until the admin approval queue exists.
- **HIPAA posture:** The Well is not a PHI system, but staff could write patient details into
  a kudo. Composer carries a "no patient details" notice; never log message content in
  plaintext to error trackers. Vercel/Supabase free tiers have no BAA; Google Cloud Run +
  Cloud SQL is the documented fallback if formal BAA coverage is ever needed.

## Brand

- **Name:** The Well. Tagline context: "by Be Well Kentucky".
- **Logo:** the BWK mountain-with-lake mark (`brand-icon.png`). Navy mountain, lighter-blue
  lake, two birds. (Source file was a JPEG with a black background; the version here has
  transparency. For production, get a proper SVG from BWK's brand assets.)
- **Palette:** slate `#2a3441`, sage `#7a9b7e`, terracotta `#c97b5c`, warm cream `#f4f1ec`,
  plum `#6b5b73` (used for the private-kudo accent).
- **Type:** Lora (serif) for headings, Inter for body, JetBrains Mono for numbers/labels.
- **Voice:** warm, calm, human. No em dashes in user-facing text (use commas, colons,
  periods, or parentheses). No emoji spam.

## The roster (real names — used in prototype mock data)

Admins/Owner:
- **Justin Wallen** — Owner, Business Manager — justin.wallen@bewellkentucky.com
- **Alecia Williams** — Admin — alecia.williams@bewellkentucky.com
- **Callie Ernspiker** — Admin, Practice Administrator — callie.ernspiker@bewellkentucky.com
- **Megan Abrams** — Admin — megan.abrams@bewellkentucky.com
- **Brenda Arellano** — Admin, Employee Engagement Lead — brenda.arellano@bewellkentucky.com

Other staff referenced in mock data: Melissa Gibson (Clinical Director), Hayley Meadows
(Associate Director), Tom Bivona (Therapist), Bryn Krivashei (Therapist), Emily Swartz
(new LCED hire). (Skyler Mitchell was removed from all data.)

## Database / Prisma gotchas

- **`prisma db push` and `prisma migrate` hang on this network.** The Supabase session
  pooler works fine for runtime queries but the migration path fails. The direct DB host
  (`db.{ref}.supabase.co`) is IPv6-only and returns `ENOTFOUND` on this machine.
  **Workaround for schema changes:**
  1. `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > migration.sql`
     (or `--from-schema-datasource` to diff against the live schema for incremental changes)
  2. Paste and run the SQL in the Supabase SQL Editor.
  3. `npx prisma generate` to regenerate the client.
  Runtime queries via `DATABASE_URL` (pooled connection) work fine — this is a migration-only issue.
- **`schema.prisma` must keep both `url` and `directUrl`** — `url` = pooled `DATABASE_URL`
  for runtime, `directUrl` = `DIRECT_URL` for migrations from environments that can reach
  the direct connection (e.g. Vercel CI). Don't remove `directUrl`.
- **Seed data uses stable string IDs + upsert for idempotency.** Seed kudos have IDs like
  `seed-kudo-0`. The kudo seed is guarded by a count check so it only runs once. User
  upserts run every request (they're idempotent) so new fields added to SEED_USERS (like
  birthday/hireDate) automatically backfill via a `updateMany WHERE birthday IS NULL`
  after each upsert. This is BambooHR-safe: once Bamboo sets the dates, the null check
  fails and the seed no longer touches them. Adding new seed fields to `update:` alone is
  NOT enough — they must also go in the `updateMany` backfill block.
- **Adding new fields to SEED_USERS won't populate them on pre-existing rows.** User rows
  are created once via the `create:` block of the upsert. If you add a new field to the
  seed after users already exist, the `create:` block never fires for those rows. You must
  either (a) run a manual `UPDATE` in the Supabase SQL Editor, or (b) add a null-safe
  `updateMany` backfill in the seed (as done for birthday/hireDate). Re-running the seed
  alone does nothing for existing rows unless an explicit backfill is wired up.

## Conventions

- Email format: `firstname.lastname@bewellkentucky.com`
- Don't commit `.env.local`. Copy `.env.local.template` → `.env.local` and fill in.
- When in doubt about a feature's intended behavior, open the prototype and match it.
- **Keep this file current.** Whenever a notable decision is made or a gotcha is hit,
  update CLAUDE.md as part of that same piece of work. It is the project's living memory.

## How to help

When asked to build, prefer matching the prototype's behavior and the decisions above.
Read the relevant doc in `docs/` before implementing an integration. Ask before
introducing a new dependency or changing a decided architecture choice.
