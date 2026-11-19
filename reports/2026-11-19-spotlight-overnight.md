# Spotlight overnight build report (2026-11-19)

Branch **`spotlight`** (local only, 10 commits on top of `main` @ 6b2cfcf). Nothing
was pushed or merged. No remotes were changed. The Vercel CLI was never run.
Supabase, DNS, BambooHR and Resend were never touched. No production value from
`.env` / `.env.local` was used: dev and tests read `.env.development.local` /
`.env.test.local` (local Postgres 16 via Homebrew, databases `spotlight_dev` and
`spotlight_test`), and the one production build check passed every `.env.local`
key in as an explicit local or blank value.

**Final result: 80/80 tests pass (8 files). Lint 0 errors. `next build` passes.
Database guard refuses 8/8 bad-URL entry points.**

---

## What was built, by phase

### 1. Plan
`reports/2026-11-19-spotlight-plan.md`: current state, a table of every way
data could leak between companies with its prevention and test, the full
rename map, how the money logic carries over, the migration approach, slice
order, and the GitHub/Vercel/Supabase/Google steps for you to do by hand.

Bugs found while reading `main` (all fixed on the branch):
- **Double-spend in every money path.** `createKudo` and `redeemReward` checked
  balances outside the transaction; `makeItRain` re-read inside it, but Postgres
  runs Prisma transactions at READ COMMITTED, so that doesn't serialize
  anything. A mutation test confirms it: without the row lock, 10 of 10
  concurrent kudos succeed against a 100-star allowance.
- `claimIncentive` checked caps outside the transaction; cap rules were copied
  in three places and disagreed on whether the end date counts.
- Kudos and self-attested claims wrote no audit rows.
- The composer had no "no patient details" notice, despite CLAUDE.md saying it did.
- **`prisma.config.ts` loaded `.env.local`**, so any local `prisma db push`
  would have hit production.

### 2. Local setup and the database guard
- `lib/dbGuard.ts`: off Vercel, refuses unless `DATABASE_URL` and `DIRECT_URL`
  are localhost **and** `spotlight_dev` / `spotlight_test`. It's wired into
  `next.config.ts`, `prisma.config.ts`, `lib/db.ts`, the seed, truncate and
  sync scripts, and the test harness. It steps aside only on real Vercel
  production/preview.
- **Proof:** `npm run db:guard:prove` runs 8 entry points (Prisma push with a
  remote URL, a wrong local db name, and a remote `DIRECT_URL`; `next dev`; the
  app db client; the seed; truncate; a Vercel-looking `development` env). All 8
  are refused.
- `.env.development.local` overrides every key `.env.local` defines, so no
  production value leaks into `next dev`.

### 3. Rename
- The Well → Spotlight; drops → stars, printed as `25 ⭐` through one
  `formatStars()`; 💧 → ⭐; Make it rain → Pile on (`PILE_ON_LABEL`).
- All Be Well Kentucky logos, favicons and copy are removed. There's a new
  Spotlight mark (white star on an accent disc) with generated PNG icons.
- Default Spotlight look: deep slate plus an ember accent (`#c2410c`).
- CSS tokens no longer use food names (honey/cream/olive/plum/sage →
  accent/canvas/moss/violet/fern).
- Seed rewards no longer include food items (DoorDash, coffee, catered lunch).
- The composer shows **"No patient names or details"**, and its example copy is
  non-clinical.

### 4. Multi-tenant
- `Company` and `CompanyDomain` tables, with `companyId` on every tenant table.
  **Composite foreign keys** make the database itself refuse a kudo, reaction,
  pile-on, claim or redemption that links two companies.
- `scopedDb(companyId)`: a Prisma extension that forces `companyId` into every
  query on tenant models. Updates can't move rows between companies, and
  unknown operations throw.
- `requireActor()` re-reads company, role and active status from the database
  on every action and page.
- A static test allowlists the few files that may use the unscoped client.
- **Sign-in:** the Google `hd` claim and verified email are mapped to a company
  through its domains (LCED: `lcedky.com` and `bewellkentucky.com`). People are
  matched by Google account id first, so the email move keeps each person's
  existing row and balances. Nobody can switch companies by signing in.
- Each company sets its own logo, brand color, address, allowance and featured
  count. BambooHR is optional and read-only per company. Google Chat posts go
  only to the company's own space.
- Roles: member, Spotlight admin, and platform owner (`/platform` page, set by
  SQL only).
- A local-only dev login and fictional seed data (Harborlight Counseling and
  LCED, with invented people).
- **Production migration SQL** (`prisma/sql/2026-11-19-spotlight-multitenant.sql`,
  not run). I rehearsed it on `spotlight_test` with the old schema and
  production-shaped fictional rows:
  - Balance totals were unchanged.
  - The owner became admin + platform owner.
  - The allowance and featured-count settings moved onto the LCED company row.
  - Rain became PileOn.
  - Afterwards, `prisma migrate diff` shows only the three objects deliberately
    left for later (`AppSetting`, `BalanceAdjustment`, `User.entity`).

### 5. Money logic
- One pattern for every money path:
  - lock every user row involved first, in id order, scoped to the company;
  - re-read and validate after the lock;
  - change statuses only with a conditional update, so a decision can't apply twice;
  - write the audit row in the same transaction.
- Only our own error messages reach the browser; Prisma and network errors are
  replaced with a generic message.
- **Unlimited-incentive bug:** the cap rules now live in one module, used by
  both the server and the UI:
  - unlimited incentives can always be claimed again, including the
    admin-review kind while a claim is still pending;
  - once, monthly and quarterly incentives lock at the cap;
  - declined claims don't count;
  - unknown caps fail closed.
- Declining a redemption refunds what the person paid exactly once, and
  restocks the item.

### 6. Incentive order and featured
- Move up/down controls in Admin › Incentives (contiguous order, guarded with
  a lock against concurrent edits).
- One order and one query module drive Admin, Earn and Home.
- Home features the top N; N is a company setting (default 2, range 0 to 6) on
  the Program tab. Admin shows a "Featured on Home" badge.

### 7. Pile on
- +5 per tap, maximum 5 taps staged on the phone, then a single "Send" commit.
- Cap of 25 per person per kudo, checked as a sum under the piler's row lock.
- Stars move from the giver's allowance to the recipient's earned wallet, and
  count toward Top givers.
- Blocked for the recipient, the original giver, and private kudos.
- Looks like a solid accent pill on its own row, with tap dots, so it isn't
  confused with the outlined ⭐ reaction chip.

### 8. Fixes
- **Keep-warm cron:** route plus a `vercel.json` entry (every 5 minutes; not deployed).
- **Account menu on mobile:** shows Admin (and Platform); admin pages now have
  the bottom nav on phones.
- **Nav order:** Feed, Earn, Rewards, Dates, Team was already right on desktop
  and mobile (they share one list); confirmed.
- **Emoji pickers:** the reaction picker pins inside the screen above the
  bottom nav on phones; the admin icon picker is clamped.
- **Admin overview:** reworked grid; the BambooHR warning shows only when
  BambooHR is connected.
- **390px pass:** done with headless Chrome over DevTools (the Chrome extension
  didn't respond overnight). Screenshots and an overflow scan found and fixed
  the nav subtitle, composer header, incentive admin rows and the filter tabs
  that widened the page. No page is now wider than 390px, and the reaction
  picker and account menu open fully on screen.

### 9. CLAUDE.md
Rewritten for Spotlight:
- the guard and local setup;
- tenant rules and money rules;
- Pile on and incentive rules;
- branding and roles;
- per-company BambooHR and Chat;
- migration notes and the gotchas.

The README and env template are updated (Resend and `ALLOWED_EMAIL_DOMAIN`
removed). `docs/` is marked as history.

---

## Test results (final run)

```
tests/dbGuard.test.ts         7  guard accepts/refuses URLs
tests/guards.test.ts          7  chat gate, cron auth, brand CSS, dev login, Bamboo domains
tests/incentiveOrder.test.ts  4  order, featured N, concurrent moves
tests/money.test.ts          16  kudos, rewards, incentives, approvals, adjustments, resets, concurrency
tests/pileOn.test.ts         11  rules, caps, allowance, concurrency, Top givers
tests/signIn.test.ts          9  domain/hd mapping, alias, email move, conflicts, inactive
tests/tenant.test.ts         25  cross-company reads and writes (all must fail)
tests/unscoped-db.test.ts     1  allowlist for the unscoped client
Test Files  8 passed (8) · Tests  80 passed (80)
```

## What didn't get done, and why

- **Visual check in your real Chrome:** the Chrome extension timed out. I used
  a separate headless Chrome with a throwaway profile instead. Desktop widths
  were only smoke-tested (every page returns 200), not screenshotted.
- **Interactive Chat pile-on:** out of scope; still unbuilt.
- **Per-company values:** you said to keep the six values, so they're still
  global constants.
- **Upload for logos:** a logo is an https link, not an upload, because there's
  no file storage yet (same reason as incentive proof uploads).
- **Deleting `prototype/`:** left in place as history.
- **Running the migration, renaming repo/Vercel/Supabase, deploying:** all left
  for you (steps in the plan, §7).

## Things that looked risky

1. **The guard depends on Vercel's system env vars.** Production relies on
   `VERCEL=1` and `VERCEL_ENV` being present at runtime. They are by default
   ("Automatically expose System Environment Variables"). If that setting is
   off, the deployed app will refuse to start. Check before deploying.
2. **Dev server process explosion.** With a `package-lock.json` in your home
   folder, Turbopack treated `~` as the workspace and spawned thousands of
   PostCSS workers until the machine hit its process limit (`fork failed`).
   - I stopped only this project's processes; your lced-portal server on :3000
     was left alone.
   - `turbopack.root` is now pinned, and later runs stayed at 2 processes under
     a watchdog.
   - Deleting `~/package-lock.json` would remove the trigger for other projects
     too.
3. **Migration on real data.** The rehearsal used fictional rows shaped from the
   old Prisma schema. Production was edited by hand-run SQL before, so it may
   differ slightly. The script runs in one transaction (all or nothing) and uses
   `IF EXISTS` on drops. Run the "before" totals query first.
4. **Email flip timing.** If someone's first post-switch sign-in comes from a
   Google account that was never linked (`googleId` null) under a new email, a
   new row is created rather than reusing the old one. Everyone who has signed
   in before is linked by Google id, so this only affects people who never
   signed in.
5. **Dev login** exists in code. It turns on only under `next dev`, off Vercel,
   with the flag and a passing guard; tests cover each condition.
6. **Prisma consent.** Prisma blocks `--force-reset` for AI agents. I didn't
   bypass it: the test harness truncates the local test tables instead, and
   only `spotlight_test` was ever schema-dropped (for the migration rehearsal).

## Open questions (my recommendation in bold)

1. **Who can change roles?** Built: platform owner only (safest). Option: let
   company admins promote and demote within their own company. **Allow it for
   admins once a second customer exists. For LCED alone, platform-owner-only is
   fine.**
2. **Pile on: stage-then-commit or charge per tap?** Built: stage up to 5 taps,
   then one Send (keeps the misfire protection CLAUDE.md asked for). **Keep it.**
3. **Company address:** set to `https://spotlight.louisvillecenterforeatingdisorders.com`
   in the migration and seed. **Confirm the host before DNS/OAuth setup;**
   it's a one-line change in `/platform`.
4. **BambooHR key storage:** env var per company (`BAMBOOHR_API_KEY_LCED`), not
   the database, so no secrets sit in the DB. **Fine for now. Move to encrypted
   DB storage if customers need to self-serve.**
5. **Keep-warm every 5 minutes** needs Vercel Pro (Hobby crons are daily).
   **Turn it on only if cold starts are noticeable.**
6. ~~**Long company names** truncate under "Spotlight" on phones.~~ Done in the
   follow-up: `Company.shortName` ("LCED").
7. **Cleanup:** drop `AppSetting`, `BalanceAdjustment` and `User.entity` after a
   week of stable production. **Yes.**
8. **Chat space for LCED:** left blank in the migration. **Copy the current
   `GCHAT_KUDOS_SPACE` value into `/platform` after migrating** if you want
   public kudos to keep posting.
9. **Declined redemptions now restock limited inventory** (they didn't before).
   **Keep.**
10. **Repo name:** the branch still lives in `the-well`. Your brief says Spotlight
    stays its own codebase; **rename the GitHub repo per plan §7** rather than
    forking.

## Follow-up (2026-11-19, later the same day)

Same rules: local branch only, nothing pushed or deployed, local databases only.

1. **Short display name.**
   - New nullable `Company.shortName`, up to 24 characters; blank falls back to
     the full name. LCED's is "LCED", the fictional Harborlight's is "Harborlight".
   - Phones show it under "Spotlight" in the nav and on the sign-in page.
     Desktop keeps the full name.
   - The platform owner edits it in `/platform`.
   - Added to the multitenant migration (`"shortName"` column, LCED inserted
     as 'LCED') and to the seed.
   - Checked on the local server: the nav renders the full name for desktop
     and "LCED" for phones, and the sign-in page renders both, swapped by CSS
     at 640px.
2. **`prisma/sql/2026-11-19-spotlight-lced-fresh-start.sql`** (not run).
   Runs right after the multitenant migration, LCED only, in one transaction:
   - First, it checks the LCED company and a platform owner exist, then
     locks LCED's user rows the way the app does.
   - It deletes kudos, reactions, pile-ons, incentive claims and redemptions,
     plus old `BalanceAdjustment` rows. That table has no `companyId`, so it
     matches on LCED people, and it skips the step if the table is gone.
   - It sets every giving allowance to the company allowance and every earned
     wallet to 0, with one `AllowanceReset` ledger row per person.
   - It writes audit rows:
     - one `fresh_start_balance` row per person, recording old and new
       balances;
     - one `fresh_start` summary row with the deleted counts;
     - the actor is the platform owner;
     - both show under the admin Audit tab's "grants" filter.
   - It keeps people, roles, Google links, incentives, the rewards catalog,
     settings, domains, time off, sync history and the audit log.
   - **Query A** (counts) at the bottom is for running before and after.
   - **Rehearsal on `spotlight_test`:**
     - Setup: old schema, the fictional production-shaped fixtures, then the
       multitenant migration, then a second fictional company (Harborlight)
       added, then the fresh start.
     - Run before the multitenant migration, the fresh start refuses with an
       error and changes nothing.
     - Afterwards, `prisma migrate diff` shows only the three objects
       deliberately left for later.
     - Counts, before -> after:

```
people                              3 ->  3
active_people                       3 ->  3
admins                              2 ->  2
linked_google                       2 ->  2
kudos                               2 ->  0
reactions                           1 ->  0
pile_ons                            1 ->  0
claims                              1 ->  0
redemptions                         6 ->  0
balance_adjustments                 1 ->  0
incentives                          2 ->  2
rewards                             4 ->  4
limited_stock_total                 7 ->  12
earned_total                      775 ->  0
giving_total                      260 ->  360
allowance                         120 ->  120
fresh_start_audit_rows              0 ->  4
other_companies_kudos               1 ->  1
other_companies_earned            340 ->  340
```

   Giving total 360 = 3 people x the carried-over 120 allowance. The other
   company's kudos and balances are unchanged.
3. **People list (query B in the same file).** Shows every LCED person's
   email, name, role, platform owner flag, active status, last sign-in,
   whether Google is linked, Bamboo status, last activity and date added.
   - It is read-only, and the script deactivates nobody. The comment has the
     `UPDATE ... active = false` to run by hand.
   - **Last sign-in was never recorded.** Auth.js uses JWT sessions, so there
     is no sessions table, and the old schema had no such column.
     - Added `User.lastSignInAt`, set on every successful Google sign-in. It
       is in the migration and tested, including that refused sign-ins don't
       update it.
     - It stays empty for everyone until they sign in after the deploy.
     - Until then, use `google_linked` (has ever signed in) and
       `last_activity` (newest kudo sent, pile-on, claim, redemption or audit
       entry).
     - **Run query B before the fresh start**, because it reads rows the
       reset deletes.
4. **Role changes stay platform-owner-only.** CLAUDE.md now says company admins
   get this when a second customer exists.
5. **Tests:** 82 of 82 pass across 8 files. New tests cover setting the short
   name (trimmed, too long refused, blank cleared) and recording the
   last-sign-in time. Lint shows 0 errors (the same one pre-existing warning).
   Typecheck is clean.

**New open questions**
- ~~**Reward inventory after the fresh start.**~~ Done in the second
  follow-up: the script now returns limited stock.
- **The audit log is kept,** including old `adjust_balance` rows. Only the
  old `BalanceAdjustment` table rows are deleted. **Keep it: the audit trail
  should survive a reset.**
- **Run the fresh start in a quiet moment.** It waits for any in-flight star
  movements and blocks new ones for the second or so it runs.

## Second follow-up: palettes, contrast, icons (2026-11-19)

Same rules: local only, nothing pushed or deployed, local databases only.

1. **Fresh start returns limited stock.** It adds +1 per deleted redemption to
   rewards with a limited inventory. Every redemption it deletes was made on
   the old app, which never restocked, not even on decline, so each one still
   holds a unit. Query C in the file shows stock per reward. Re-rehearsed on
   `spotlight_test`:
   - Setup: old schema, fictional fixtures with limited rewards in every
     redemption status, the multitenant migration, then a second company.
   - Limited stock, before:

```
    title    | inventory | redemptions_now 
-------------+-----------+-----------------
 Desk plant  |         0 |               3
 Team outing |         2 |               2
 Tote bag    |         5 |               0
(3 rows)
```

   - Limited stock, after:

```
    title    | inventory | redemptions_now 
-------------+-----------+-----------------
 Desk plant  |         3 |               0
 Team outing |         4 |               0
 Tote bag    |         5 |               0
(3 rows)
```

   - The other company's limited reward (Harbor mug, 4, with a pending
     redemption) is unchanged.
   - All counts, before -> after:

```
people                              3 ->  3
active_people                       3 ->  3
admins                              2 ->  2
linked_google                       2 ->  2
kudos                               2 ->  0
reactions                           1 ->  0
pile_ons                            1 ->  0
claims                              1 ->  0
redemptions                         6 ->  0
balance_adjustments                 1 ->  0
incentives                          2 ->  2
rewards                             4 ->  4
limited_stock_total                 7 ->  12
earned_total                      775 ->  0
giving_total                      260 ->  360
allowance                         120 ->  120
fresh_start_audit_rows              0 ->  4
other_companies_kudos               1 ->  1
other_companies_earned            340 ->  340
```

2. **Per-company palette.**
   - `Company.theme` (JSON, 14 neutral-named tokens, `lib/theme.ts`) replaces
     `brandColor`. Null means the Spotlight default: deep teal `#0f766e`,
     neutral grays, and accent = primary, so there is no second hue.
   - It is edited in `/platform`, with a live AA check, and the server
     refuses a failing palette. Company admins keep only the logo.
   - The migration adds the column with LCED's palette and recolors LCED's
     rewards and incentives from the navy family. The seed gives LCED its
     palette and Harborlight the default.
   - Every old CSS token was mapped onto the palette, and literal colors are
     gone except fixed status colors (danger, success, star) and shadows.
3. **LCED palette, navy first.**
   - **Navy:** primary Anchor Navy (buttons, nav bar, Pile on, kudo amount
     chips); Ink for the darkest surfaces and hover; Steady Navy for
     headings; Quiet Steel for subheads and states.
   - **Mauve:** only the composer's Send kudos button (`.btn-cta`, Ink text,
     Deep Mauve with Cream on hover), plus the company short name in the nav
     in Whisper.
   - **Pile on:** solid Anchor Navy with Cream text; the ⭐ reaction stays an
     outlined chip.
   - Tests check that the accent appears only in those rules and never in
     the item swatches.
4. **Contrast.** 28 text and button pairs are checked at AA (4.5:1) for both
   palettes (`themeContrastPairs`, tested).
   - **Adjusted Slate Light `#6B7785` -> `#5A6573`.** It was 4.09 on Warm
     Paper, 4.27 on Cream and 3.61 on Mist; it is now 5.31, 5.54 and 4.69.
   - **Confirmed the rule you described.** Cream on Logo Mauve is 3.08 and
     white on Logo Mauve is 3.29, so the CTA uses Ink (5.27). Cream on Deep
     Mauve is 5.56.
   - **Fixed while checking:**
     - The balance-card label was the primary color on the darkest surface
       (nearly invisible); it is now Fog.
     - The active desktop nav link was navy on navy; it is now Cream.
     - 39 caption rules faded `--text-muted` with `opacity`, dropping below
       AA; the fades are removed, and a test now blocks faded text.
     - Input placeholders were the browser default gray (about 2.5:1); they
       are now `--text-muted`.
   - **Not changed:**
     - ~~Input borders on Line~~: done in round 2 (Quiet Steel).
5. **Icons.** `/brand-icon/[file]` draws the app icons (SVG, 16/32/48, 180
   Apple, 192, 512, 512 maskable) from the requesting company's palette:
   primary square, Ink disc, Fog ring, Cream star. The manifest and
   theme-color follow the palette too.
   - The `public/` icons and `favicon.ico` were regenerated from the
     Spotlight default palette (the old orange set is gone).
   - Copies of the LCED and default icons are in
     `reports/screens/2026-11-19/icons/`.
6. **Screens** (LCED, fictional admin Dana Whitfield, local dev; the Next.js
   dev badge is hidden): `reports/screens/2026-11-19/`, with
   `{home,feed,earn,rewards,admin}-{390,desktop}.png`.
   - 390 is 390x844; desktop is 1280x860. Both are taken at 2x.
   - "Feed" is Home scrolled to the first kudo, because the Feed tab is
     Home.
   - No page scrolls sideways at 390.
7. **Checks:**
   - Tests: 93 of 93 pass across 9 files. The new `tests/theme.test.ts`
     covers both palettes at AA, the original Slate Light failing, light
     text on mauve, the CSS defaults matching `DEFAULT_THEME`, where the
     accent is used, faded text, swatches, and the platform save, refusal
     and owner-only rule.
   - Lint: 0 errors (same one warning).
   - `next build`: passes with every `.env.local` key overridden by local
     values.
   - After both migrations, `prisma migrate diff` shows only the three
     objects deliberately left for later.

**Open questions**
- **Who edits the palette?** It is platform-owner-only, because a bad palette
  can make the app unreadable. **Keep it that way until a second customer
  asks.**
- **Item colors.** LCED's existing rewards and incentives are recolored from
  the navy family by the migration. **Fine; admins can re-pick from the
  palette swatches.**

## Round 2 polish (2026-11-19)

Same rules: local only, nothing pushed or deployed, local databases only.

1. **Composer example:** now "You covered my group on short notice and the
   patients never felt the gap" beats "great job!" It names no patient and
   fits any role.
2. **Desktop nav:** shows the short name ("LCED") under Spotlight, with the
   full name as a tooltip, the same as phones. Nothing is cut off any more.
3. **Admin nav item:** same case, size and colors as Feed, Earn and the
   others. The separate uppercase style is removed.
4. **Pile on, phones:** a compact 24px pill, about the height of the value
   chips and at the WCAG 2.5.8 minimum target size. It is Anchor Navy with
   Cream text, keeps the tap dots (smaller), and drops the shadow. Desktop
   keeps the larger pill.
5. **Composer glow:** removed (markup and CSS; a test keeps it gone).
6. **Form fields:**
   - Inputs, textareas and selects use `--subtle` borders: Quiet Steel
     `#3E6792` for LCED and `#4B5563` in the default palette. Focus adds a
     ring.
   - Dividers stay on Line.
   - The palette check now includes three non-text pairs at 3:1 (field
     border on card, page and tint). LCED measures 5.52 / 5.29 / 4.67; the
     default 7.56 / 7.17 / 6.79. `/platform` refuses a palette that fails
     any of them.
7. **Palette editing:** stays platform-owner-only, and CLAUDE.md now says so
   explicitly.
8. **Screens:** `reports/screens/2026-11-19/round2/` has
   `{home,feed}-{390,desktop}.png` (LCED, fictional admin, local dev). No
   page scrolls sideways at 390.

**Checks:** tests 95 of 95 pass across 9 files (new: field-border contrast
and CSS, glow removed). Lint has 0 errors (same one warning). `next build`
passes with local settings only.


## Launch switch (2026-11-19)

- **`Company.isOpen`** (default false). The migration creates LCED **closed**,
  with a new step 9 in the header. While closed, only the platform owner,
  LCED admins and testers can sign in. **`User.isTester`** is set per person
  in `/platform` under "Roles and testers".
- **Everyone else** from lcedky.com or bewellkentucky.com gets a calm
  "Spotlight is coming soon" page with the company name and logo, and a
  "Use a different account" link.
  - No user row is created, and an existing row isn't touched (no Google
    link, no last sign-in).
  - Each refusal writes an audit row, `signin_refused_closed`. Its actor is
    empty for people with no account. To allow that, the migration now makes
    `AuditLog.actorId` nullable.
  - `/platform` shows how many refused sign-ins there have been so far.
- **Sessions:** someone already signed in when a company closes gets the same
  page. `getActor` returns nothing for them, so they can't take any action.
- **Opening and closing:** "Open Spotlight" (and "Close Spotlight") in
  `/platform` are platform-owner only. Each asks for confirmation and writes
  an audit row (`open_company` / `close_company`). Tester changes are audited
  too.
- **Nothing outbound for a closed company:**
  - the allowance-reset cron skips it;
  - BambooHR sync refuses it before making any request (cron, admin button
    and CLI);
  - Chat never posts, even for an admin's public kudo;
  - the Chat bot replies only "Spotlight is coming soon".

  Keep-warm is unchanged.
- **Decision for you:** I read "no outbound action" strictly, so an admin
  can't run a BambooHR sync to pre-load people before launch. If you'd like
  that, it's a one-line change in `syncBambooHR`.
- **Update:** BambooHR sync now runs while a company is closed (cron,
  admin button and command line). It only reads from BambooHR and sends
  nothing to staff. People it creates or updates still can't sign in until
  the company opens. Chat and the allowance reset stay blocked.
- **Local seed:** both fictional companies are seeded open so dev works, with
  one fictional tester (Priya Okafor). New companies created in `/platform`
  start closed.
- **Screens:** `reports/screens/2026-11-19/launch/` contains:
  - the coming-soon page after a refused sign-in (390 and desktop);
  - the same page for an old session (390);
  - the closed LCED launch card in `/platform`;
  - the tester checkboxes.

**Checks:**
- Tests: 112 of 112 pass across 10 files. The new `tests/launch.test.ts` has
  16 cases, covering:
  - a member refused and audited, with their row left alone;
  - no row created for new people (including the alias domain);
  - owner, admin and tester admitted;
  - an old session blocked;
  - opening as owner only, with audit, after which everyone gets in;
  - an open second company unaffected;
  - testers set by owner only;
  - cron, BambooHR and Chat skipped while closed.
- Mutation check: I disabled each gate in turn (sign-in, getActor, Chat,
  cron, Bamboo), and each time at least one test failed.
- Lint: 0 errors.
- `next build` passes with local settings only.

## Production migration fix (2026-11-19)

The first real run failed and rolled back:
`2BP01: cannot drop index "User_bambooId_key" because constraint User_bambooId_key requires it`.
Production was partly built by hand, so its schema differs from the
rehearsal's.

**How I checked.** I restored the production backup into a throwaway local
database, `spotlight_prodcopy`, with `pg_restore --no-owner --no-privileges`.
I compared its catalog with the old schema the scripts assumed: columns,
types, defaults, NOT NULLs, constraints, FKs, indexes, triggers, RLS,
policies, views and publications. The database has since been dropped.
Nothing from it was committed or copied into the repo, and only counts
appear here.

**Restore errors (all ignored, all Supabase or version specific):**
- `transaction_timeout` isn't a setting in PG16 (the local server is 16; the
  dump is from 17);
- the `supabase_vault` extension isn't available locally (twice: create, then
  comment);
- `vault.secrets` doesn't exist, so no secrets were copied.

**Schema differences, and what I did about each:**

| # | Production | Scripts assumed | Fix |
|---|---|---|---|
| 1 | `User_bambooId_key` is a UNIQUE **constraint** | a plain unique index | `ALTER TABLE "User" DROP CONSTRAINT IF EXISTS` before `DROP INDEX IF EXISTS` (the failure) |
| 2 | extra index `Rain_userId_idx` | not present | dropped before the rename (it would have stayed on PileOn under an old name) |
| 3 | `IntegrationSync.lastRunAt` is `timestamptz` with default `now()` | `timestamp(3)` with default `CURRENT_TIMESTAMP` | converted to `timestamp(3)` `AT TIME ZONE 'UTC'`, default reset. All 196 rows keep the same instant (checked by fingerprint) |
| 4 | `TimeOff.start` / `TimeOff.end` are `timestamptz` | `timestamp(3)` | same conversion (0 rows in production) |
| 5 | `Rain_kudoId_fkey`: no ON UPDATE CASCADE. `Rain_userId_fkey`: plain | CASCADE rules | none needed: both are dropped and recreated |
| 6 | `Rain.amount` has no default | default 0 | none needed: `DROP DEFAULT` is a no-op |
| 7 | `AppSetting.updatedAt` defaults to `CURRENT_TIMESTAMP` | no default | none needed: the table is left for later cleanup |
| 8 | `AuditLog_actorId_fkey` is `ON DELETE RESTRICT` | Prisma would make it `SET NULL` once `actorId` became optional | `onDelete: Restrict` added to `schema.prisma` (people are deactivated, never deleted) |

I also put `DROP CONSTRAINT IF EXISTS` before every other `DROP INDEX`, so
any uniqueness rule production has as a constraint is handled. I checked
every other DROP, RENAME and ALTER in the migration against the real names;
all match. There's no RLS, no policies, no views, and no tables in the
Realtime publication. Supabase's own event triggers ran without trouble
during the rehearsal. The migration is still one transaction.

**Rehearsal on the production copy.** The migration committed, then the
fresh start committed. Query A, LCED, before → after the fresh start:

| | Before | After |
|---|---|---|
| people | 34 | 34 (all active, 3 admins, 3 linked to Google) |
| earned | 1175 | 0 |
| giving | 3400 | 3400 (34 × 100) |
| kudos | 2 | 0 |
| pile-ons (was rain) | 0 | 0 |
| reactions | 0 | 0 |
| redemptions | 6 | 0 |
| claims | 2 | 0 |
| incentives | 6 | 6 |
| rewards | 9 | 9 |
| audit rows | 22 | 57 (35 fresh-start rows: 34 per person + 1 summary) |

Other results:
- Query B returned 34 rows.
- Query C returned no rows: production has no limited-stock rewards, so the
  restock step does nothing.
- 34 AllowanceReset rows were written.
- After the migration:
  - LCED is **closed** and has 0 testers. Only the 1 platform owner and the
    other 2 admins can sign in until you mark testers or open it.
  - The short name is LCED and the palette is set.
  - Both domains are mapped, and incentive order is contiguous.

**Second run from scratch.** I restored a fresh copy and ran the migration
and then the fresh start again. Both committed with no errors and gave the
same counts. The migrated schema is **identical** to what Prisma creates
from `schema.prisma`, apart from the three legacy objects left on purpose
(`AppSetting`, `BalanceAdjustment`, `User.entity`). The fixed migration
also still runs cleanly on the old fictional rehearsal schema.

**Checks:** the app never pointed at the copy (its database guard only
allows `spotlight_dev` and `spotlight_test`). Tests: 116 of 116 pass.
Lint: 0 errors. The production build passes with local settings only.
