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
- **The two-pool balance model must be labeled explicitly everywhere.** There are two separate
  pools: (1) the **giving allowance** (`givingBalance`) — a monthly budget for recognizing
  teammates that depletes as you give and refills on reset. Label it "To give this month" in
  giving contexts (feed widget, composer). (2) the **earned wallet** (`balance`) — drops the
  user has received or earned, permanently theirs to redeem. Label it "Your drops" /
  "Earned · yours to spend" in spending contexts (rewards, earn pages). Both are shown
  side-by-side in the feed widget so the distinction is visible at a glance. **Never show a
  bare number with just "d" — always label which pool it is.** This framing was a deliberate
  fix: the two pools look like the same currency in two accounts, which caused confusion even
  for the owner who designed the system. That's a strong signal the labels must do the work.
  Do not revert to "balance" / "Your balance" / "Drops to give balance" without explicit
  discussion.
- **Public/private kudo toggle.** Public (default) posts to #kudos + the feed. Private goes
  only to the recipient's DM, visible to sender + recipient + Owner only.
- **Entity field (BWK/LCED/Both) is back-office only.** Removed from the Feed and Team
  directory because staff overlap so much the distinction is meaningless for recognition.
  KEPT in Admin → Reports for cost attribution (which org's books a reward cost lands on).
  **Entity is NOT synced from BambooHR yet and will not be until Admin Reports is built.**
  BambooHR's `Division` field (id 1355) is job-function, not org. `Location` could proxy
  for entity (Louisville = BWK, Lexington = LCED) but can't express "Both" for dual-org
  staff. The right path is a BambooHR custom field set up deliberately when Reports is
  built, so entity attribution is intentional and accurate from day one. Until then the
  `entity` column defaults to "BWK" and is set manually if needed.
- **Incentives** have two verification modes: self-attest (instant credit) and admin-verify
  (goes to an approvals queue). Proof currently supports a link or text description only.
  Screenshot/photo upload is deferred until file storage (Vercel Blob or Supabase Storage)
  is set up — that work pairs naturally with production deployment. The modal shows a
  "coming soon" note so the link-only UI reads as intentional.
- **Reactions are NOT synced between the app and Google Chat** (v1). Two separate pools.
  See `docs/chat-integration.md` for the reasoning.
- **The sidebar leaderboard ranks GIVERS, not receivers.** This is deliberate: celebrating
  who gives the most recognition encourages generosity and avoids turning the feed into a
  popularity contest, which matters in a behavioral health setting. Do not flip this to
  receivers without explicit discussion.
- **Recognition UI is hierarchy-agnostic.** Do not show job titles in celebration or ranking
  contexts (leaderboard, kudos feed, reaction lists). Titles are fine in the Team directory
  and the Dates/tenure list where they provide useful context, but surfacing them alongside
  recognition scores reintroduces hierarchy the platform is designed to stay neutral about.
- **BambooHR workEmail is the canonical join key and must match Google primaryEmail exactly.**
  Mismatches (maiden vs. married name, nickname vs. legal name) cause silent sync failures:
  the employee appears in BambooHR's directory but gets skipped with no error, leaving their
  User row un-enriched (bambooId stays null). When a user fails to enrich after a full sync,
  compare their DB email against `GET /employees/directory` workEmail fields — the mismatch
  will be obvious. Fix by updating the email in whichever system is wrong (usually Bamboo),
  then updating the DB row by user ID (not by email) to preserve kudo/reaction foreign keys,
  and updating the seed + avatarColor.ts to match.
- **Company values (exactly six, exact names):** Compassion, Ownership, Curiosity, Team-First, Excellence, Above & Beyond. Use these verbatim everywhere — in the composer, kudo cards, seed data, and any admin UI. Do not substitute synonyms or add new ones.
- **No app store.** It's a PWA — people add it to their home screen. App name "The Well".
- **Giving-balance reset is unbuilt and the cadence is undecided.** The feed balance widget
  shows "resets Mon" but this is aspirational — `givingBalance` never actually refills.
  The reset cadence (weekly on Mondays vs. monthly on the 1st) was not decided before
  building the UI; "Mon"/weekly is copied from the prototype as a placeholder. Do not treat
  it as decided. The reset requires a scheduled cron job (Vercel Cron or similar) and
  therefore only makes sense to build at deployment time — cron jobs don't run on localhost.
  Decide cadence + build the reset logic (cron route + `AllowanceReset` ledger write +
  `givingBalance` increment on all active users) together when deploying to production.
  Until then, `givingBalance` stays at whatever it was last set to (default 100 from schema).
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

## Planned features (designed, not yet built)

### Kudo pile-on / boost drops

On an existing feed kudo, alongside emoji reactions, a "+đ" button lets other staff
add drops from their own giving allowance to amplify that recognition. Core decisions:

- **Source pool:** piler's `givingBalance` (giving allowance), same as original kudos. Not
  earned wallet. Giving allowance already caps total giving naturally, so no separate
  per-kudo or per-piler cap is needed.
- **Destination pool:** original recipient's `balance` (earned wallet) — same as received kudos.
- **Giver-credit:** the piler gets leaderboard credit as a giver (same `amount` counted in the
  monthly giving sum), because they routed real currency. This rewards breadth of generosity.
- **Mechanics:** atomic transaction — decrement piler's `givingBalance`, increment recipient's
  `balance`, record a `KudoBoost` row (or similar) linking piler + kudo + amount. Same
  two-pool accounting and giver-credit pattern as `createKudo`, just attached to an existing
  kudo rather than a new post.
- **Display:** aggregate on the kudo card — "+45đ from 6 people" — below the message, near
  reactions. Individual piler names shown on expand or hover (open design Q).
- **Rationale:** frictionless co-signing of recognition you already agree with; amplifies
  genuine moments into collective celebration; stronger signal than emoji (routes real
  currency); rewards breadth of recognition on the giver leaderboard. On-brand with the
  generosity/team-first ethos. Reuses all existing patterns.

**Open design questions for when this is built:**
- Fixed presets (+5/+10/+25) vs. free-amount input (or both).
- Whether the piler's name appears in the feed card inline or only on expand.
- Whether to show a "+đ" affordance on every kudo or only on kudos the viewer didn't send.

**Schema sketch (not applied yet):**
```
model KudoBoost {
  id        String   @id @default(cuid())
  kudoId    String
  fromId    String               // piler (givingBalance decremented)
  amount    Int
  createdAt DateTime @default(now())

  kudo Kudo @relation(fields: [kudoId], references: [id])
  from User @relation(fields: [fromId], references: [id])

  @@unique([kudoId, fromId])     // one boost per piler per kudo (or remove for multiple)
}
```
Add `boosts KudoBoost[]` to `Kudo` and `boostedKudos KudoBoost[]` to `User`.

### Incentive proof via file upload

Currently, incentive proof is link-only. A "require a photo/document" option was
intentionally deferred because file upload needs a storage backend that isn't set up yet.

**Dependencies (must land together):**
1. **File storage** — Supabase Storage or Vercel Blob. Needs a deployed environment with
   env vars (`SUPABASE_STORAGE_URL` or `BLOB_READ_WRITE_TOKEN`) to test meaningfully;
   localhost testing is awkward. Vercel Blob is the simplest path given Vercel hosting.
2. **Upload widget on the Earn page** — replace/augment the `proofLink` text input in the
   staff claim modal with a file picker that uploads to storage and returns a URL stored
   in a new `IncentiveClaim.proofUrl` field (or reuses `proofLink` if the URL is sufficient).
3. **Proof type option in the incentive editor** — add a "Proof required" field to the
   incentive create/edit form: `none` (current default) / `link` / `file` / `either`.
   Store as `Incentive.proofType String @default("none")`. The Earn page claim modal
   renders the appropriate input based on this field. Adding the editor option before the
   upload pipeline exists is misleading, so build them together.
4. **Uploaded file visible in admin approvals** — the ApprovalsPanel claim row needs a
   "View proof" link/thumbnail next to the claim. Currently `proofLink` is shown as text;
   `proofUrl` (the uploaded file) would render as a clickable thumbnail or download link.

**Schema sketch (not applied yet):**
```
// On Incentive:
proofType String @default("none") // "none" | "link" | "file" | "either"

// On IncentiveClaim:
proofUrl String? // signed URL or path to uploaded file in storage
```

**Sequencing note:** build in order — storage config → upload widget → proof type field in
editor → admin approvals view. The editor option is the last piece because it's meaningless
without the upload pipeline behind it. Pairs naturally with the production deployment work
since storage setup requires deployed env vars.

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
  1. Hand-write or derive the delta SQL for the new table/column (see AuditLog migration
     as a reference — Prisma 7's `--from-config-datasource` flag also hangs on this network).
  2. Paste and run the SQL in the Supabase SQL Editor.
  3. `npx prisma generate` to regenerate the client.
  Runtime queries via `DATABASE_URL` (pooled connection) work fine — this is a migration-only issue.
- **`IncentiveClaim.rewardSnapshot`** stores the incentive's drop reward at the moment
  a claim is submitted. `approveIncentiveClaim` uses this value (falling back to
  `incentive.reward` for pre-snapshot claims) so editing an incentive's reward after
  a claim is submitted does not change what the claimant receives upon approval.
- **`BalanceAdjustment` table is deprecated and orphaned.** All balance adjustment
  writes now go to `AuditLog` (action: `"adjust_balance"`). The `BalanceAdjustment`
  model is kept in `schema.prisma` to avoid a destructive migration, but nothing reads
  or writes it anymore. Candidate to drop at the next planned schema migration.
- **Prisma 7: connection URLs live in `prisma.config.ts`, NOT `schema.prisma`.** The
  `datasource db` block in `schema.prisma` only has `provider = "postgresql"`. Both `url`
  (pooled `DATABASE_URL`) and `directUrl` (`DIRECT_URL`) are set in `prisma.config.ts`
  under `datasource`. Don't put them back in `schema.prisma` — Prisma 7 will reject it.
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

## BambooHR field map (confirmed via /v1/meta/fields, subdomain: bewellkentucky)

These are the real field aliases and IDs for this tenant. Use aliases in API requests,
not numeric IDs (aliases are stable; IDs are internal).

| Purpose | Alias | ID | Notes |
|---|---|---|---|
| Work email (join key) | `workEmail` | 15 | Join on `User.email` |
| First name | `firstName` | — | Standard field |
| Last name | `lastName` | — | Standard field |
| Preferred name | `preferredName` | 1358 | Use for `fullName` if set |
| Job title | `jobTitle` | 17 | → `User.title` |
| Department | `department` | 4 | → `User.department` |
| Location | `location` | 18 | → `User.location` (Louisville/Lexington etc.) |
| Manager | `reportsTo` | 91 | → `User.reportsTo` (display name string). BambooHR calls this "Reporting to", NOT "supervisor" |
| Hire date | `hireDate` | 3 | → `User.hireDate` |
| Date of birth | `dateOfBirth` | 6 | → `User.birthday` |
| Employment status | `employmentHistoryStatus` | 16 | → `User.employmentStatus` |

**No custom fields exist in this account yet.** `customField_5021` from the doc is a
placeholder — the entity custom field doesn't exist yet and won't be created until
Admin Reports is built. When it is created, run `/v1/meta/fields` again to get its ID.

The `reportsTo` response is an object `{ "id": "123", "displayName": "Jane Smith" }` —
extract `.displayName` for storing in `User.reportsTo`.

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
