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

### Kudo pile-on / "Make it rain" ✅ BUILT (rework required before rollout)

Shipped as the Rain mechanic. +5đ per tap, 25đ cap per person per kudo.
`Rain` table: `@@unique([kudoId, userId])`, amount accumulates. Single sequential
`$transaction` enforces all blocking rules with in-tx re-reads. Rain strip shows
avatars + "+Xđ from N people" below the kudo card. Button hidden for sender,
recipient, and private kudos. See `app/actions/makeItRain.ts`.

**HIGH PRIORITY — do before staff rollout. Money-integrity rework required.**

### Make it rain: rework to stage-then-commit (Variant 2)

The current spend-per-tap model has an accidental-compounding problem: a misfire
spends 5đ immediately; tapping again to "fix" it doubles it. Must be reworked to
stage-then-commit before the app goes live with real balances.

**New interaction model:**
- Each tap stages drops locally in client state only (5 → 10 → 15 → 20 → 25đ). No DB
  writes on tap. Small rain animation plays on each tap to give haptic-equivalent feedback.
- A "Send rain" commit button appears once any amount is staged. Tapping it fires ONE
  atomic transaction for the full staged amount. Big animation plays on successful commit.
- A "Cancel" / clear resets staged amount to 0. This is the undo — nothing moved until
  commit, so cancel is a true no-op.

**Money logic (server side — `app/actions/makeItRain.ts`):**
- Single `$transaction`, all reads inside. Never trust the client-submitted staged amount.
- Server re-validates the full amount against:
  1. Actor's current `givingBalance` (must be ≥ staged amount).
  2. The per-kudo 25đ cap — read the actor's existing `Rain.amount` row inside the tx and
     add staged amount; total must be ≤ 25đ. The cap is a running total across all sessions
     (already-committed rain counts toward it), not a per-session cap.
- Keep `@@unique([kudoId, userId])` accumulating row: on commit, upsert — if row exists,
  increment `amount`; if not, create with `amount = staged`.
- Commit button disables immediately on first fire (client guard). In-tx re-read is the
  backstop against rapid double-commit.

**New double-spend vector to guard:** user stages 25đ, slow network, taps "Send" twice
before first response. Client disable-on-fire is the first line; the in-tx cap re-read
ensures the second commit fails gracefully if the first succeeded.

**Tests to confirm before pushing:**
1. Stage 25đ → commit → giver −25đ, recipient +25đ, Rain row shows 25đ.
2. Already have 20đ committed → stage 10đ more → client blocks at 5đ (cap headroom = 5);
   server rejects anything > 5đ even if client is bypassed.
3. Insufficient giving allowance → server rejects; clear error returned.
4. Stage any amount → clear → no DB writes, balances unchanged.
5. Sender or recipient of the kudo → button never appears; server blocks if called directly.
6. Rapid double-commit (disable-on-fire bypassed) → second tx sees cap already met, throws.
7. Full flow on a private kudo → server blocks.

**Implementation note:** The staged amount is pure `useState` in `KudoCard.tsx`. The
server action signature changes from `makeItRain(kudoId)` to `makeItRain(kudoId, amount)`.
Expand and read the full diff of the commit action before pushing (money logic + "use
server" file — do not export non-function values from the server action module).

**Design note (not a task yet — for when notifications are built):** Rain notifications
must be delayed and batched ("3 people rained +35đ on your kudo") rather than firing
per-tap or per-commit, to avoid notification storms. Align batching window with any
future hold/commit window design.

### Mobile TopNav wordmark ↔ balance swap (build after Variant 2 rain rework is green)

On mobile, the center/left slot of the top nav swaps its text content based on page and
scroll position. The logo icon (`.tnav-mark`) is always visible and always links to `/`.
Only the wordmark text slot (`.tnav-wordmark`) changes.

**Swap logic:**
- **Show wordmark** ("The Well / BY BE WELL KENTUCKY"): when on the home page (`/`) AND
  scrolled to the top (within ~8px of top). This is the resting / home state.
- **Show balances** ("600đ give · 4950đ earned"): on any non-home page, OR on the home
  page when scrolled down past the threshold. The balances are informational only —
  non-clickable. The icon handles home navigation.

**Hysteresis to prevent strobing:** use a small scroll hysteresis band (~16px) so
micro-scrolls near the threshold don't rapidly toggle between the two states. Scroll
down past 24px → switch to balances; scroll back up to ≤8px → switch back to wordmark.
Implement with a ref tracking last-stable state; only update if the new scroll position
clears the hysteresis gap from the last transition point.

**Animation:** CSS crossfade (opacity transition, ~150ms) on the swap. The two states
share the same slot; use `position: absolute` children inside a relative container sized
to the taller of the two, or animate opacity on a single element that re-renders content.
Avoid layout shift — the container height should be stable across both states.

**Desktop:** no swap. Icon + wordmark + balances coexist. Balances live top-right near
the avatar (exact placement TBD when building — match whatever looks balanced with the
existing nav layout). No scroll listener needed on desktop.

**Balance display format:** `{givingBalance}đ give · {balance}đ earned`. Use
`font-family: var(--font-mono)` for the numbers to match the existing balance widget style.
Align with the two-pool label convention from CLAUDE.md ("giving balance" vs "earned wallet").

**Data / live-update wiring:**
- Balances must reflect post-give and post-rain state without a full page reload. This
  depends on the balance state architecture that Variant 2 of the rain rework is currently
  settling. Build this feature AFTER the rain rework lands green and is verified in
  production, so the wiring approach is clear.
- Likely implementation: balance values passed as props from the server component (already
  fetched in `app/page.tsx`), propagated through `PageShell` → `TopNav`. On give/rain,
  `revalidatePath("/")` already triggers a server re-render; the nav picks up fresh values
  automatically. If live-update without full re-render is needed later, a lightweight
  client store (Zustand or React context) can be threaded through.

**Implementation sketch:**
- `TopNav` receives `givingBalance` and `balance` props (or fetches them; currently it
  does a `db.user.findUnique` for role/name — add balance selects there).
- On mobile, a `"use client"` wrapper around the wordmark slot handles the scroll listener
  and page detection via `usePathname()` + `useScrollPosition()` (simple `useEffect` +
  `window.scrollY`). The server-rendered nav structure stays intact; only the text slot
  is a client island.
- Crossfade: two absolutely-positioned `<span>`s inside a fixed-height container, toggled
  by opacity. Or a single `<span>` whose content is swapped with a fade — simpler but
  causes a content flash on swap. The two-span approach is cleaner.

**Sequencing:** block on Variant 2 rain rework being merged and verified green on Vercel.
Then build. The scroll/pathname listener is straightforward; the trickier part is threading
the balance props without adding another DB call to a component that already calls auth().

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

### Reward visual: imageUrl vs. icon/color

`Reward` currently has two visual fields:
- **`imageUrl String?`** — used by the staff shop (Rewards page) to show a product image.
  Written by the seed data and not yet exposed in the Admin UI editor.
- **`icon String` + `color String`** — added for the Admin Rewards tab so each catalog row
  has a recognizable visual in the admin list. Same pattern as Incentives.

This is an interim split: admin displays use emoji/color; the staff shop uses imageUrl.
**Eventually decide the canonical reward visual** — options: (a) emoji icon everywhere and
drop imageUrl; (b) imageUrl everywhere (requires upload pipeline); (c) imageUrl for rewards
that have one, emoji fallback otherwise. Make the decision when the staff shop UI is redesigned
or when file storage is set up, whichever comes first.

### Suggested giving prompts (Tier 3 — build after Team-profile + recipient-picker)

Surface contextual nudges in the feed or a dedicated section so giving allowances
actually get spent rather than sitting idle. This is the demand-side complement to the
two-pool model.

**Trigger types (in rough priority order):**
1. **Upcoming birthday / work anniversary** — Dates tab data already exists; birthday and
   hireDate are on the User model. A daily or per-render query finds anyone with a milestone
   in the next 7 days and surfaces a prompt ("Hayley's 3-year anniversary is Friday — send
   her some recognition"). Likely the quickest win because the data pipeline is done.
2. **Person not recognized recently** — staff who have received no kudos in the past 30 days.
   Surfaces as a gentle "It's been a while since [Name] was recognized — send them a kudo."
3. **Current user not giving recently** — esp. useful in the week before the allowance reset.
   "You have 80đ to give this month — it resets in 4 days." Pairs with the giving balance
   widget already on the feed.
4. **New-hire welcome prompts** — user whose hireDate is within the last 30 days. "Welcome
   [Name] to the team — be the first to send them a kudo."
5. **Value-coverage gaps** (optional / lower priority) — kudos in the past 30 days that lean
   heavily on 1-2 values; suggest giving against an underused value like Curiosity or
   Ownership. Adds nudge variety but requires more logic; defer until the simpler triggers
   are in.

**UI placement (open design question):**
- A "Who to recognize" card in the right rail (alongside Leaderboard / Coming up), or
- Inline prompts at the top of the feed composer area (below the composer, above the feed), or
- Both: rail card for desktop, inline strip on mobile where the rail is hidden.

**Key mechanic:** tapping a prompt opens the composer pre-filled with the suggested recipient
(person chip already in the recipient field) and optionally a starter message. This is the
same prefilled-composer + person-chip plumbing needed for Team-profile "send kudos" buttons.
Build these together or directly after.

**Rationale:** at a 28-person org, the recognition graph is sparse. A few people give
actively; most hold their allowance through the month. Prompts convert passive allowance
holders into active givers — the supply side of recognition is already there (the givingBalance
model), prompts activate the demand side. On-brand: warm, specific, low-friction nudges fit
the behavioral health ethos better than generic gamification.

**Dependencies:**
- Birthday/hireDate data: already on the User model, populated by BambooHR sync.
- Prefilled-composer: needs the composer to accept an initial recipient prop (currently it
  doesn't — the recipient picker is always blank on open). Build this for Team-profile CTA
  buttons and reuse here.
- Allowance reset date: the reset cadence is still undecided (see "Giving-balance reset is
  unbuilt" above). The "allowance expiring soon" prompt needs a known reset date to compute
  days-remaining. Build that trigger after the reset cron is live.

### Redemption.cost is always a snapshot

`Redemption.cost` was designed as a cost-at-time-of-redemption snapshot from day one
(schema comment: "snapshot at time of redemption"). The `declineRedemption` refund uses
`current.cost`, not `reward.cost` — so refunds are always the amount the staff member
actually paid, even if the reward cost is later edited. No fix needed; correctly implemented.

## Google Chat bot — in progress

Decided to build an **interactive Chat bot** (not just a one-way webhook). Architecture
principle: **the app is canonical; Chat is a surface.** All state lives in the Well DB;
Chat is just another way to interact with it.

### User mapping

Resolve Chat users to Well users **live by email on each interaction** — no stored
mapping table. Chat identities and Well users are the same `@bewellkentucky.com` Google
Workspace identities, so matching is reliable: look up the sender's email against
`User.email` (which has `@unique` → implicit Postgres index, so lookups are fast).

Do **not** add a `chatUserId ↔ wellUserId` join table unless real email drift appears in
practice (e.g. a user's Chat identity diverges from their Well email). That case hasn't
occurred and the table adds complexity for no current benefit.

### No-account case

If a Chat user's email doesn't resolve to a Well user, reply in Chat: **"Sign in to The
Well first."** Never auto-create a Well account from a Chat interaction — account creation
is intentionally gated to Google OAuth sign-in in the app.

### Money / action security

- Any rain or give triggered from Chat must run through the **same server-side actor
  re-check + atomic `$transaction`** as the in-app path. No shortcuts.
- The Chat callback endpoint **must verify that requests genuinely come from Google**
  (Google Chat request signature verification) before doing anything consequential. A
  forged callback must never be able to move drops.

### Build order

1. Cloud project + Chat API enablement + app registration + interaction endpoint scaffold
2. One-way posting (kudos → #kudos space) + user resolution + no-account reply
3. Interactive rain callback — **built last, reviewed carefully** (money logic)

### Reference

See `docs/chat-integration.md` for additional design context and the reasoning behind
keeping Chat reactions separate from app reactions.

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
