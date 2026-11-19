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
redemptions                         1 ->  0
balance_adjustments                 1 ->  0
incentives                          2 ->  2
rewards                             1 ->  1
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
- **Reward inventory after the fresh start.** Deleted redemptions don't put
  limited stock back, because you said keep the catalog as-is. **Check
  limited-stock rewards (e.g. Team outing) in Admin > Rewards after running,
  and reset the counts by hand if needed.**
- **The audit log is kept,** including old `adjust_balance` rows. Only the
  old `BalanceAdjustment` table rows are deleted. **Keep it: the audit trail
  should survive a reset.**
- **Run the fresh start in a quiet moment.** It waits for any in-flight star
  movements and blocks new ones for the second or so it runs.

