-- ════════════════════════════════════════════════════════════════════════════
-- Spotlight: LCED fresh start                                     2026-11-19
--
-- Run ONCE, by hand, in the Supabase SQL editor, right AFTER
-- 2026-11-19-spotlight-multitenant.sql has committed, and after a backup.
-- Not run yet. Affects the LCED company only (id 'company_lced').
--
-- Before running:
--   1. Run query A (counts) and query B (people list) at the bottom, on
--      their own, and save the results. Query B's "last activity" column
--      reads kudos and claims that this script deletes, so it is only
--      useful BEFORE the reset.
--   2. Then run everything from BEGIN to COMMIT in one go.
--   3. Run query A again and compare.
--
-- In one transaction (any failure changes nothing):
--   - deletes LCED's kudos, reactions, pile-ons, incentive claims,
--     redemptions and old BalanceAdjustment rows;
--   - returns limited reward stock (+1 per deleted redemption, rewards with
--     a non-null inventory only). Every redemption here was made on the old
--     app, which never restocked, not even on decline, so each one still
--     holds a unit of stock;
--   - sets every LCED person's giving allowance to the company allowance and
--     every earned wallet to 0, with an AllowanceReset ledger row each;
--   - writes audit rows: one per person (old and new balances) and one
--     company-level summary.
--
-- Keeps: people, roles, platform owner flags, Google links, active status,
-- incentives, the rewards catalog (titles, costs, active flags; only the
-- limited stock counts change, as above),
-- company settings, domains, time off, sync history and the audit log.
-- Deactivates nobody; use query B to choose who to deactivate by hand.
--
-- Rehearsed locally on spotlight_test right after the multitenant rehearsal
-- (see reports/2026-11-19-spotlight-overnight.md, "Follow-up").
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Preconditions, and lock LCED's people like the app does ─────────────
-- The app takes FOR UPDATE row locks on users before moving stars, so any
-- kudo or redemption in flight either finishes first or waits for this.
DO $$
DECLARE
  n_company int;
  n_actor   int;
BEGIN
  SELECT count(*) INTO n_company FROM "Company" WHERE id = 'company_lced';
  IF n_company <> 1 THEN
    RAISE EXCEPTION 'LCED company (company_lced) not found. Run the multitenant migration first.';
  END IF;
  SELECT count(*) INTO n_actor FROM "User" WHERE "isPlatformOwner" = true;
  IF n_actor = 0 THEN
    RAISE EXCEPTION 'No platform owner to record as the actor on the audit rows.';
  END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM "User" WHERE "companyId" = 'company_lced' ORDER BY id FOR UPDATE;
END $$;

-- Snapshot of balances and counts before anything changes; used for the
-- audit rows below. Dropped automatically at COMMIT.
CREATE TEMP TABLE fresh_start_before ON COMMIT DROP AS
SELECT u.id, u."fullName", u.balance AS old_balance, u."givingBalance" AS old_giving
  FROM "User" u
 WHERE u."companyId" = 'company_lced';

CREATE TEMP TABLE fresh_start_counts ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM "Kudo"           WHERE "companyId" = 'company_lced') AS kudos,
  (SELECT count(*) FROM "Reaction"       WHERE "companyId" = 'company_lced') AS reactions,
  (SELECT count(*) FROM "PileOn"         WHERE "companyId" = 'company_lced') AS pile_ons,
  (SELECT count(*) FROM "IncentiveClaim" WHERE "companyId" = 'company_lced') AS claims,
  (SELECT count(*) FROM "Redemption"     WHERE "companyId" = 'company_lced') AS redemptions,
  (SELECT coalesce(sum(balance), 0)        FROM "User" WHERE "companyId" = 'company_lced') AS earned_total,
  (SELECT coalesce(sum("givingBalance"), 0) FROM "User" WHERE "companyId" = 'company_lced') AS giving_total;

-- ── 1. Delete activity (children before parents) ────────────────────────────
DELETE FROM "Reaction"       WHERE "companyId" = 'company_lced';
DELETE FROM "PileOn"         WHERE "companyId" = 'company_lced';
DELETE FROM "Kudo"           WHERE "companyId" = 'company_lced';
DELETE FROM "IncentiveClaim" WHERE "companyId" = 'company_lced';

-- Put limited stock back before the redemptions go.
CREATE TEMP TABLE fresh_start_restock ON COMMIT DROP AS
SELECT d."rewardId" AS reward_id, count(*)::int AS units
  FROM "Redemption" d
  JOIN "Reward" r ON r.id = d."rewardId" AND r."companyId" = d."companyId"
 WHERE d."companyId" = 'company_lced' AND r.inventory IS NOT NULL
 GROUP BY d."rewardId";

UPDATE "Reward" r
   SET inventory = r.inventory + s.units
  FROM fresh_start_restock s
 WHERE r.id = s.reward_id AND r."companyId" = 'company_lced';

DELETE FROM "Redemption"     WHERE "companyId" = 'company_lced';

-- BalanceAdjustment is the old single-tenant table: no companyId, so match
-- on LCED people. Skipped if the table was already dropped.
DO $$
DECLARE n int := 0;
BEGIN
  IF to_regclass('public."BalanceAdjustment"') IS NOT NULL THEN
    EXECUTE 'DELETE FROM "BalanceAdjustment"
              WHERE "userId"  IN (SELECT id FROM "User" WHERE "companyId" = ''company_lced'')
                 OR "actorId" IN (SELECT id FROM "User" WHERE "companyId" = ''company_lced'')';
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  CREATE TEMP TABLE fresh_start_adjustments ON COMMIT DROP AS SELECT n AS balance_adjustments;
END $$;

-- ── 2. Balances: allowance to the company amount, earned wallet to 0 ────────
UPDATE "User" u
   SET "givingBalance" = c."allowanceAmount",
       balance         = 0,
       "updatedAt"     = CURRENT_TIMESTAMP
  FROM "Company" c
 WHERE c.id = 'company_lced' AND u."companyId" = c.id;

INSERT INTO "AllowanceReset" ("id", "companyId", "userId", "amount", "resetAt")
SELECT 'fs_ar_' || md5(u.id || clock_timestamp()::text), u."companyId", u.id, c."allowanceAmount", CURRENT_TIMESTAMP
  FROM "User" u JOIN "Company" c ON c.id = u."companyId"
 WHERE u."companyId" = 'company_lced';

-- ── 3. Audit rows ───────────────────────────────────────────────────────────
-- Actor: the earliest platform owner (an LCED one if there is one).
CREATE TEMP TABLE fresh_start_actor ON COMMIT DROP AS
SELECT id, "fullName" FROM "User"
 WHERE "isPlatformOwner" = true
 ORDER BY ("companyId" = 'company_lced') DESC, "createdAt", id
 LIMIT 1;

-- One per person: what they had before. amount = change to the earned wallet.
INSERT INTO "AuditLog" ("id", "companyId", "createdAt", "actorId", "actorName",
                        "targetId", "targetName", "action", "details", "amount", "reason")
SELECT 'fs_al_' || md5(b.id || clock_timestamp()::text),
       'company_lced', CURRENT_TIMESTAMP, a.id, a."fullName",
       b.id, b."fullName", 'fresh_start_balance',
       format('Earned wallet %s -> 0 ⭐; giving allowance %s -> %s ⭐',
              b.old_balance, b.old_giving, c."allowanceAmount"),
       -b.old_balance,
       'LCED fresh start for the Spotlight launch'
  FROM fresh_start_before b
 CROSS JOIN fresh_start_actor a
 CROSS JOIN (SELECT "allowanceAmount" FROM "Company" WHERE id = 'company_lced') c;

-- One summary row for the company.
INSERT INTO "AuditLog" ("id", "companyId", "createdAt", "actorId", "actorName",
                        "action", "details", "reason")
SELECT 'fs_al_company_' || md5(clock_timestamp()::text),
       'company_lced', CURRENT_TIMESTAMP, a.id, a."fullName", 'fresh_start',
       format('Deleted %s kudos, %s reactions, %s pile-ons, %s incentive claims, %s redemptions (%s limited-stock units returned), %s balance adjustments. '
              'Earned wallets %s -> 0 ⭐ total; giving allowances %s -> %s ⭐ total for %s people.',
              k.kudos, k.reactions, k.pile_ons, k.claims, k.redemptions,
              (SELECT coalesce(sum(units), 0) FROM fresh_start_restock), adj.balance_adjustments,
              k.earned_total, k.giving_total,
              (SELECT coalesce(sum("givingBalance"), 0) FROM "User" WHERE "companyId" = 'company_lced'),
              (SELECT count(*) FROM fresh_start_before)),
       'LCED fresh start for the Spotlight launch'
  FROM fresh_start_counts k
 CROSS JOIN fresh_start_adjustments adj
 CROSS JOIN fresh_start_actor a;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- A. Counts. Run BEFORE the reset and again AFTER, and compare.
--    After: kudos, reactions, pile_ons, claims, redemptions and
--    balance_adjustments are 0; earned_total is 0; giving_total is
--    people x allowance; limited_stock_total goes up by the number of
--    deleted redemptions of limited rewards; people, admins, linked_google,
--    incentives and rewards are unchanged; harborlight_* (or any other company) unchanged.
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT
--   (SELECT count(*) FROM "User"           WHERE "companyId" = 'company_lced') AS people,
--   (SELECT count(*) FROM "User"           WHERE "companyId" = 'company_lced' AND active) AS active_people,
--   (SELECT count(*) FROM "User"           WHERE "companyId" = 'company_lced' AND role = 'admin') AS admins,
--   (SELECT count(*) FROM "User"           WHERE "companyId" = 'company_lced' AND "googleId" IS NOT NULL) AS linked_google,
--   (SELECT count(*) FROM "Kudo"           WHERE "companyId" = 'company_lced') AS kudos,
--   (SELECT count(*) FROM "Reaction"       WHERE "companyId" = 'company_lced') AS reactions,
--   (SELECT count(*) FROM "PileOn"         WHERE "companyId" = 'company_lced') AS pile_ons,
--   (SELECT count(*) FROM "IncentiveClaim" WHERE "companyId" = 'company_lced') AS claims,
--   (SELECT count(*) FROM "Redemption"     WHERE "companyId" = 'company_lced') AS redemptions,
--   (SELECT count(*) FROM "BalanceAdjustment" ba JOIN "User" u ON u.id = ba."userId" WHERE u."companyId" = 'company_lced') AS balance_adjustments,
--   (SELECT count(*) FROM "Incentive"      WHERE "companyId" = 'company_lced') AS incentives,
--   (SELECT count(*) FROM "Reward"         WHERE "companyId" = 'company_lced') AS rewards,
--   (SELECT coalesce(sum(inventory), 0)    FROM "Reward" WHERE "companyId" = 'company_lced' AND inventory IS NOT NULL) AS limited_stock_total,
--   (SELECT coalesce(sum(balance), 0)         FROM "User" WHERE "companyId" = 'company_lced') AS earned_total,
--   (SELECT coalesce(sum("givingBalance"), 0) FROM "User" WHERE "companyId" = 'company_lced') AS giving_total,
--   (SELECT "allowanceAmount" FROM "Company" WHERE id = 'company_lced') AS allowance,
--   (SELECT count(*) FROM "AuditLog"       WHERE "companyId" = 'company_lced' AND action LIKE 'fresh_start%') AS fresh_start_audit_rows,
--   (SELECT count(*) FROM "Kudo"           WHERE "companyId" <> 'company_lced') AS other_companies_kudos,
--   (SELECT coalesce(sum(balance), 0)      FROM "User" WHERE "companyId" <> 'company_lced') AS other_companies_earned;
-- (If BalanceAdjustment has been dropped, delete that one line.)

-- ════════════════════════════════════════════════════════════════════════════
-- B. LCED people, to choose who to deactivate by hand. Read-only.
--    last_sign_in: recorded by Spotlight from the first sign-in after deploy;
--      the old app never stored it, so it is empty for everyone until then.
--    google_linked: has signed in with Google at least once, ever.
--    last_activity: newest kudo sent, pile-on, claim, redemption or audit
--      entry by them (reactions carry no timestamp). Run this BEFORE the reset (it reads rows the
--      reset deletes); afterwards only the audit log feeds it.
--    Deactivate (never delete) with:
--      UPDATE "User" SET active = false, "updatedAt" = CURRENT_TIMESTAMP
--       WHERE "companyId" = 'company_lced' AND email IN ('...');
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT u.email,
--        u."fullName"                AS name,
--        u.role,
--        u."isPlatformOwner"         AS platform_owner,
--        u.active,
--        u."lastSignInAt"            AS last_sign_in,
--        (u."googleId" IS NOT NULL)  AS google_linked,
--        u."employmentStatus"        AS bamboo_status,
--        GREATEST(
--          (SELECT max(k."createdAt")  FROM "Kudo" k           WHERE k."fromId"  = u.id AND k."companyId" = u."companyId"),
--          (SELECT max(p."createdAt")  FROM "PileOn" p         WHERE p."userId"  = u.id AND p."companyId" = u."companyId"),
--          (SELECT max(c."createdAt")  FROM "IncentiveClaim" c WHERE c."userId"  = u.id AND c."companyId" = u."companyId"),
--          (SELECT max(d."createdAt")  FROM "Redemption" d     WHERE d."userId"  = u.id AND d."companyId" = u."companyId"),
--          (SELECT max(a."createdAt")  FROM "AuditLog" a       WHERE a."actorId" = u.id AND a."companyId" = u."companyId")
--        )                           AS last_activity,
--        u."createdAt"               AS added
--   FROM "User" u
--  WHERE u."companyId" = 'company_lced'
--  ORDER BY u.active DESC, last_activity DESC NULLS LAST, u."fullName";

-- ════════════════════════════════════════════════════════════════════════════
-- C. Limited reward stock, per reward. Run before and after; each limited
--    reward goes up by its number of deleted redemptions.
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT r.title, r.inventory,
--        (SELECT count(*) FROM "Redemption" d WHERE d."rewardId" = r.id AND d."companyId" = r."companyId") AS redemptions_now
--   FROM "Reward" r
--  WHERE r."companyId" = 'company_lced' AND r.inventory IS NOT NULL
--  ORDER BY r.title;

