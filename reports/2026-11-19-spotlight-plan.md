# Spotlight: plan (2026-11-19)

Branch: `spotlight` (local only, off `main` @ 6b2cfcf). Nothing pushed, nothing deployed.

---

## 1. Current state (what "The Well" is today)

- Next.js 16.2 App Router, React 19, Auth.js v5 (Google), Prisma 7 + `@prisma/adapter-pg`, Postgres on Supabase, Vercel hosting.
- **Single tenant.** One Google Workspace domain lock (`ALLOWED_EMAIL_DOMAIN`, default `bewellkentucky.com`) in `auth.ts`. No company concept anywhere in the schema. Every query is global (`db.user.findMany({ where: { active: true } })` etc.).
- Tables: User, Kudo, Rain, Reaction, Reward, Redemption, AllowanceReset, TimeOff, IntegrationSync, Incentive, IncentiveClaim, BalanceAdjustment (deprecated, orphaned), AuditLog, AppSetting (global key/value).
- Roles: `member | admin | owner` on User. Owner = Justin. Only owners can change roles.
- Money paths (server actions in `app/actions/`): `createKudo`, `makeItRain`, `claimIncentive`, `redeemReward`, `approveIncentiveClaim`, `declineIncentiveClaim`, `approveRedemption`, `declineRedemption`, `adjustBalance`. Plus cron `reset-allowances`.
- Integrations: BambooHR sync (`lib/syncBambooHR.ts`, env-keyed, creates + enriches users), Google Chat one-way posting (`lib/chat/postKudo.ts`, single space from env), Chat bot endpoint (`app/api/chat/route.ts`, JWT-verified, reply only). Resend is **not** in code (only in `.env.local.template` and docs).
- No test framework. No migrations folder (schema changes were hand-run SQL in Supabase).

### Bugs and gaps found during inspection

| # | Where | Problem |
|---|---|---|
| B1 | `createKudo` | Balance check happens **outside** the transaction, then an unconditional `decrement`. Two concurrent sends can both pass the check and drive `givingBalance` negative. |
| B2 | `makeItRain` | Reads are "in-tx", but Prisma interactive transactions run at Postgres READ COMMITTED. Two concurrent commits both read the same balance/cap and both write. The "in-tx re-read backstop" in CLAUDE.md does not actually serialize anything. |
| B3 | `redeemReward` | Same pattern as B1: check outside tx; inventory can go negative; balance can go negative. |
| B4 | `claimIncentive` | Cap check outside the transaction (double claim under concurrency). Admin-verified claims write no audit row; self-attest credit writes no audit row. |
| B5 | `claimIncentive` / Earn UI | Cap logic is duplicated in three places (`claimIncentive`, `app/earn/page.tsx`, `lib/relevantClaims.ts`). The Earn page uses `endsAt >= now`, Home uses `endsAt > now`. This is where the "unlimited incentive" bug class lives: cap rules drift between server and UI. Fix is one shared pure function used by server and UI, plus tests. |
| B6 | `createKudo` | No audit row for kudos (money movement with no ledger entry). |
| B7 | Composer | CLAUDE.md says the composer carries a "no patient details" notice. It does not. |
| B8 | `prisma.config.ts` | Loads `.env.local`, which holds production `DATABASE_URL`. Any local `prisma db push` would hit production. |
| B9 | `lib/syncBambooHR.ts` | Creates its own PrismaClient, bypassing any guard. `bambooId` is globally unique (would collide across tenants). |
| B10 | Admin | `featuredCount` setting is read on Home but there is no admin UI to set it. Sort order is a raw number field. |

---

## 2. Multi-tenant design

### Model

```
Company        id, slug (unique), name, appUrl (nullable, e.g. https://spotlight.louisvillecenterforeatingdisorders.com),
               logoUrl (nullable), brandColor (hex, nullable -> Spotlight default),
               allowanceAmount (default 100), featuredIncentiveCount (default 2),
               bambooEnabled (bool), bambooSubdomain (nullable), chatSpace (nullable),
               active, createdAt
CompanyDomain  domain (PK, lowercase, globally unique) -> companyId
```

`companyId` is added to **every** tenant table: User, Kudo, PileOn (was Rain), Reaction, Reward, Redemption, AllowanceReset, TimeOff, IntegrationSync, Incentive, IncentiveClaim, AuditLog, CompanySetting (replaces global AppSetting). Child tables (Reaction, PileOn, Redemption, IncentiveClaim) carry their own `companyId` even though it is derivable, so every query can filter on it directly and the DB can enforce it.

### Roles

- `User.role`: `member` (default, everyone) | `admin` (Spotlight admin: approvals, rewards, incentives, balance adjustments, program settings).
- `User.isPlatformOwner`: boolean, settable only by SQL. Platform owner can see `/platform` (all companies), create companies, edit domains/branding/settings, and change roles in any company. Inside their own company they also have admin rights.
- Existing `owner` rows migrate to `admin` + `isPlatformOwner = true`.

### How a request gets its tenant

1. Sign-in: Google profile -> email domain + `hd` claim -> `CompanyDomain` -> company. No company for the domain = sign-in refused.
2. Every server action and page calls `requireActor()` (`lib/tenant.ts`), which re-reads the User row **from the DB** by session user id and returns `{ userId, companyId, role, isPlatformOwner }`. Inactive or missing user = refused. The client never supplies a companyId.
3. All tenant data access goes through `scopedDb(companyId)`: a Prisma client extension that injects `companyId` into `where` for every read/update/delete/count/aggregate/groupBy, and into `data` for every create/createMany/upsert, on every tenant model. A lookup by id from another company therefore returns "not found".
4. Inside money transactions, `SELECT ... FOR UPDATE` row locks also filter by `companyId`.

### Every place data could leak between companies, and the prevention

| Leak vector | Prevention | Test |
|---|---|---|
| Feed lists another company's kudos | Feed query via scoped client | `tenant.test`: feed read as A never contains B kudos |
| Composer recipient list / Team directory / Dates / Coming up / Leaderboard show other company's people | Scoped client on all User queries | directory + leaderboard isolation tests |
| Kudo sent to a user id in another company | Recipient looked up via scoped client -> "Recipient not found"; DB composite FK `(toId, companyId) -> User(id, companyId)` | cross-tenant createKudo test |
| Reaction / pile-on on another company's kudo id | Kudo looked up via scoped client; composite FK on Reaction/PileOn | cross-tenant reaction + pile-on tests |
| Claim another company's incentive / redeem another company's reward | Scoped lookup; composite FKs | cross-tenant claim + redeem tests |
| Admin of A approves/declines B's claim or redemption, adjusts B's user, edits B's reward/incentive | Scoped lookups in every admin action | cross-tenant admin action tests |
| Admin pages (People, Reports, Audit, Overview, Approvals) aggregate across companies | All admin page queries via scoped client | admin read isolation tests |
| Global settings (allowance, featured count) shared | Settings moved onto `Company` columns | settings isolation test |
| Allowance reset cron resets everyone with one amount | Cron iterates companies, uses each company's amount, scoped updates | cron test |
| BambooHR sync writes users into the wrong company | Sync runs per company; employees whose work email domain is not one of that company's domains are skipped; `bambooId` unique per company | sync domain-filter unit test |
| Google Chat posts company A kudos into a shared space | Space comes from `Company.chatSpace` (null = no post) | privacy-gate unit test |
| Sign-in with a domain not belonging to any company, or a consumer Google account using a company address | `hd` claim must be present and be one of that company's domains; `email_verified` required | sign-in resolver unit tests |
| A user's email changes to a domain owned by a different company | Sign-in matches by Google `sub` first and refuses if the new domain is not one of the user's own company's domains | sign-in resolver test |
| JWT carries a stale company / role | Session is identity only; `requireActor()` re-reads company/role/active from DB on every action and page | covered by action tests (role revoked -> refused) |
| Raw `db` used somewhere new and unscoped | Static test: only an allowlist of files may import the unscoped `db` | `unscoped-db.test` |
| Avatar proxy | Already host-pinned, carries no tenant data | n/a |
| Platform owner screens | Explicit `isPlatformOwner` check, uses unscoped db intentionally | platform guard test |

---

## 3. Rename map

| Old | New |
|---|---|
| The Well | Spotlight |
| by Be Well Kentucky | (removed; the company's own name shows instead) |
| drops / drop | stars / star |
| `12đ` | `12 ⭐` (one formatter: `formatStars()` in `lib/currency.ts`) |
| 💧 signature reaction | ⭐ |
| Make it rain / rain | Pile on (label in one config value, `PILE_ON_LABEL`), button "Pile on +5 ⭐" |
| `Rain` model / table | `PileOn` / `"PileOn"` |
| `makeItRain()` | `pileOn()` |
| audit `make_it_rain` | `pile_on` (old rows still display) |
| CSS `--honey`, `--honey-deep`, `--cream`, `--cream-2`, `--olive`, `--plum`, `--sage` | `--accent`, `--accent-deep`, `--canvas`, `--canvas-2`, `--moss`, `--violet`, `--fern` (no food names) |
| Be Well logos in `public/` | Spotlight mark (SVG + generated PNG icons) |
| `ALLOWED_EMAIL_DOMAIN` | `CompanyDomain` table |
| `AppSetting` | `Company` columns |
| `BalanceAdjustment` | removed from schema (table left in prod, see migration) |

**Unchanged by decision:** the six values (Compassion, Ownership, Curiosity, Team-First, Excellence, Above & Beyond), the two-pool model and its labels ("To give this month" / "Your stars" / "Earned · yours to spend"), the givers leaderboard. Never "Me too". No food or body references in names or copy (seed rewards like DoorDash, coffee, catered lunch get replaced).

DB column names `balance` and `givingBalance` stay (renaming money columns buys nothing and adds migration risk).

---

## 4. Money logic carry-over

Rules that carry over unchanged: two pools; kudos and pile-ons move stars from the giver's `givingBalance` to the recipient's `balance`; redemptions spend `balance`; declined redemptions refund the snapshot `cost`; approved claims credit `rewardSnapshot ?? reward`.

New pattern for every money path (one helper, `lib/money.ts`):

1. One interactive `$transaction`.
2. First statement: lock every user row the tx will touch with `SELECT ... FOR UPDATE`, ordered by id (avoids deadlocks), filtered by `companyId`.
3. Re-read balances/caps after the lock, validate, write.
4. Status transitions use conditional `updateMany({ where: { id, status: "pending" } })` and require `count === 1`.
5. Audit row written inside the same tx for every money movement (kudo, pile-on, claim credit, approve/decline, redeem, adjust, allowance reset).

Tests run real concurrent calls against `spotlight_test` and assert final balances.

---

## 5. Migration approach

- **Local:** `prisma db push` against `spotlight_dev` / `spotlight_test` (guarded). Seed with fictional data.
- **Production (later, by hand):** `prisma/sql/2026-11-19-spotlight-multitenant.sql`, written by hand and rehearsed locally against `spotlight_test` loaded with the old schema plus fixture rows. It:
  1. creates `Company` + `CompanyDomain`, inserts LCED with domains `lcedky.com` and `bewellkentucky.com`;
  2. adds `companyId` to every table, backfills every existing row to LCED, then sets NOT NULL + FKs;
  3. moves `AppSetting` values onto the Company row;
  4. renames `Rain` -> `PileOn`; converts `owner` -> `admin` + `isPlatformOwner`;
  5. swaps global uniques for per-company ones (`bambooId`);
  6. leaves `BalanceAdjustment` and `AppSetting` in place (drop statements commented out).
- Sign-in matches by Google `sub` before email, so when staff primary emails flip from `@bewellkentucky.com` to `@lcedky.com` their existing rows (and balances) are reused and the email is updated, not duplicated.

---

## 6. Slice order

1. DB guard + local env + test harness (vitest against `spotlight_test`).
2. Rename (copy, symbols, CSS tokens, branding, Spotlight default look, icons).
3. Multi-tenant (schema, scoped client, `requireActor`, sign-in resolver, per-company branding, roles, platform page) + isolation tests.
4. Money logic hardening + unlimited-incentive fix + tests.
5. Incentive ordering + featured N.
6. Pile on.
7. Fixes (keep-warm cron, mobile admin menu, nav order, picker on screen, admin overview, 390px pass).
8. CLAUDE.md.

---

## 7. Renames you do by hand later (not done tonight)

**GitHub repo**
1. Settings -> General -> rename `the-well` to `spotlight`. GitHub redirects the old URL.
2. Locally: `git remote set-url origin <new url>`.

**Vercel**
1. Project -> Settings -> General -> rename project to `spotlight`.
2. Settings -> Git: confirm it follows the renamed repo.
3. Env vars: remove `ALLOWED_EMAIL_DOMAIN`, `RESEND_API_KEY`, `EMAIL_FROM`. Rename `BAMBOOHR_API_KEY` to `BAMBOOHR_API_KEY_LCED` (key per company slug). Keep `BAMBOOHR_SUBDOMAIN` only if you skip setting `Company.bambooSubdomain`. Set `CRON_SECRET` if not set.
4. Domains: add `spotlight.louisvillecenterforeatingdisorders.com`; keep `thewell.bewellkentucky.com` as a redirect for a while.
5. Crons: the new `vercel.json` adds a keep-warm cron every 5 minutes; that schedule needs a Pro plan.

**Google Cloud OAuth client**
1. Add the new production origin and `https://<new host>/api/auth/callback/google` as an authorized redirect URI.
2. Consent screen: Internal works only for one Workspace org. LCED staff are in one org, so Internal is still fine for v1. Selling to other companies needs an External, verified app.
3. Update `AUTH_URL` in Vercel.

**Supabase**
1. Back up first (Database -> Backups, or `pg_dump` from a machine that can reach it).
2. Run `prisma/sql/2026-11-19-spotlight-multitenant.sql` in the SQL editor, in one go, during a quiet window.
3. Run the verification queries at the bottom of that file.
4. Project rename in Supabase settings is cosmetic and optional.

**Google Chat**
1. The bot's name and avatar in the Marketplace SDK listing still say The Well.
2. Set `Company.chatSpace` for LCED to the current `GCHAT_KUDOS_SPACE` value (the SQL does this from a placeholder you fill in).
