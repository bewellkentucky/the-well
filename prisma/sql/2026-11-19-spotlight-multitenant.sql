-- ════════════════════════════════════════════════════════════════════════════
-- Spotlight multi-tenant migration (The Well -> Spotlight)        2026-11-19
--
-- Run ONCE, by hand, in the Supabase SQL editor, after taking a backup.
-- Everything is in one transaction: if any statement fails, nothing changes.
--
-- What it does:
--   1. Creates Company + CompanyDomain and inserts LCED with its two sign-in
--      domains (lcedky.com, bewellkentucky.com).
--   2. Adds companyId to every tenant table and backfills every existing row
--      to LCED. Then NOT NULL + foreign keys, including composite keys that
--      stop the database from ever linking rows from two companies.
--   3. Moves the global AppSetting values onto the LCED Company row.
--   4. Renames Rain -> PileOn (one row per commit from now on; existing rows
--      are kept as-is and still count toward the 25 cap).
--   5. Roles: "owner" -> "admin" + isPlatformOwner = true.
--   6. Per-company bambooId uniqueness; drops User.domain (now derived).
--   7. Adds Company.shortName (LCED = "LCED", shown under "Spotlight" on
--      phones) and User.lastSignInAt (empty until people sign in again).
--   8. Company.theme: LCED's 14-color palette (navy first, mauve accent).
--      Recolors LCED's rewards and incentives from that palette.
--
-- What it deliberately does NOT do (commented out at the bottom):
--   - drop AppSetting, BalanceAdjustment, User.entity. Drop them later once
--     you're happy, they are unused by Spotlight.
--
-- Rehearsed locally against spotlight_test loaded with the old schema plus
-- fictional rows (see reports/2026-11-19-spotlight-overnight.md).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Companies ────────────────────────────────────────────────────────────
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "appUrl" TEXT,
    "logoUrl" TEXT,
    "theme" JSONB,
    "allowanceAmount" INTEGER NOT NULL DEFAULT 100,
    "featuredIncentiveCount" INTEGER NOT NULL DEFAULT 2,
    "bambooEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bambooSubdomain" TEXT,
    "chatSpace" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

CREATE TABLE "CompanyDomain" (
    "domain" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyDomain_pkey" PRIMARY KEY ("domain")
);
CREATE INDEX "CompanyDomain_companyId_idx" ON "CompanyDomain"("companyId");
ALTER TABLE "CompanyDomain" ADD CONSTRAINT "CompanyDomain_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Company" ("id", "slug", "name", "shortName", "appUrl", "theme", "allowanceAmount", "featuredIncentiveCount",
                       "bambooEnabled", "bambooSubdomain", "chatSpace", "updatedAt")
VALUES ('company_lced', 'lced', 'Louisville Center for Eating Disorders', 'LCED',
        'https://spotlight.louisvillecenterforeatingdisorders.com',  -- change if the address differs
        -- LCED palette: navy first, mauve accent only (lib/theme.ts LCED_THEME;
        -- textMuted darkened from #6b7785 for WCAG AA).
        '{"primary":"#14304d","primaryStrong":"#0b1b2d","heading":"#1f4368","subtle":"#3e6792","mutedOnDark":"#7c9bbb","tint":"#dce6f0","accent":"#b97aa3","accentStrong":"#8e4f76","accentSoft":"#e0c4d6","page":"#f6f2ec","card":"#faf7f1","text":"#3a4654","textMuted":"#5a6573","line":"#c5ccd3"}'::jsonb,
        100, 2,
        false,  -- turn on after setting BAMBOOHR_API_KEY_LCED in Vercel
        NULL,   -- BambooHR subdomain, e.g. the old BAMBOOHR_SUBDOMAIN value
        NULL,   -- Google Chat space, e.g. the old GCHAT_KUDOS_SPACE value ('spaces/...')
        CURRENT_TIMESTAMP);

INSERT INTO "CompanyDomain" ("domain", "companyId") VALUES
  ('lcedky.com', 'company_lced'),
  ('bewellkentucky.com', 'company_lced');

-- Carry over the old global settings, if present.
UPDATE "Company" SET "allowanceAmount" = GREATEST(0, s.value::int)
  FROM "AppSetting" s
 WHERE s.key = 'allowanceAmount' AND s.value ~ '^[0-9]+$' AND "Company".id = 'company_lced';
UPDATE "Company" SET "featuredIncentiveCount" = LEAST(6, GREATEST(0, s.value::int))
  FROM "AppSetting" s
 WHERE s.key = 'featuredCount' AND s.value ~ '^[0-9]+$' AND "Company".id = 'company_lced';

-- ── 2. companyId on every tenant table (backfill to LCED) ───────────────────
ALTER TABLE "User"            ADD COLUMN "companyId" TEXT;
ALTER TABLE "Kudo"            ADD COLUMN "companyId" TEXT;
ALTER TABLE "Rain"            ADD COLUMN "companyId" TEXT;
ALTER TABLE "Reaction"        ADD COLUMN "companyId" TEXT;
ALTER TABLE "Reward"          ADD COLUMN "companyId" TEXT;
ALTER TABLE "Redemption"      ADD COLUMN "companyId" TEXT;
ALTER TABLE "AllowanceReset"  ADD COLUMN "companyId" TEXT;
ALTER TABLE "TimeOff"         ADD COLUMN "companyId" TEXT;
ALTER TABLE "IntegrationSync" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Incentive"       ADD COLUMN "companyId" TEXT;
ALTER TABLE "IncentiveClaim"  ADD COLUMN "companyId" TEXT;
ALTER TABLE "AuditLog"        ADD COLUMN "companyId" TEXT;

UPDATE "User"            SET "companyId" = 'company_lced';
UPDATE "Kudo"            SET "companyId" = 'company_lced';
UPDATE "Rain"            SET "companyId" = 'company_lced';
UPDATE "Reaction"        SET "companyId" = 'company_lced';
UPDATE "Reward"          SET "companyId" = 'company_lced';
UPDATE "Redemption"      SET "companyId" = 'company_lced';
UPDATE "AllowanceReset"  SET "companyId" = 'company_lced';
UPDATE "TimeOff"         SET "companyId" = 'company_lced';
UPDATE "IntegrationSync" SET "companyId" = 'company_lced';
UPDATE "Incentive"       SET "companyId" = 'company_lced';
UPDATE "IncentiveClaim"  SET "companyId" = 'company_lced';
UPDATE "AuditLog"        SET "companyId" = 'company_lced';

ALTER TABLE "User"            ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Kudo"            ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Rain"            ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Reaction"        ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Reward"          ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Redemption"      ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "AllowanceReset"  ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "TimeOff"         ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "IntegrationSync" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Incentive"       ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "IncentiveClaim"  ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "AuditLog"        ALTER COLUMN "companyId" SET NOT NULL;

-- ── 3. User: roles, platform owner, per-company bambooId ────────────────────
ALTER TABLE "User" ADD COLUMN "isPlatformOwner" BOOLEAN NOT NULL DEFAULT false;
-- Set on each Google sign-in from now on; the old app never recorded it.
ALTER TABLE "User" ADD COLUMN "lastSignInAt" TIMESTAMP(3);
UPDATE "User" SET "isPlatformOwner" = true, "role" = 'admin' WHERE "role" = 'owner';
UPDATE "User" SET "role" = 'member' WHERE "role" NOT IN ('admin', 'member');
ALTER TABLE "User" DROP COLUMN IF EXISTS "domain";  -- now derived from CompanyDomain

DROP INDEX IF EXISTS "User_bambooId_key";
CREATE UNIQUE INDEX "User_companyId_bambooId_key" ON "User"("companyId", "bambooId");
CREATE UNIQUE INDEX "User_id_companyId_key" ON "User"("id", "companyId");
CREATE INDEX "User_companyId_active_idx" ON "User"("companyId", "active");

-- ── 4. Rain -> PileOn ───────────────────────────────────────────────────────
ALTER TABLE "Rain" DROP CONSTRAINT IF EXISTS "Rain_kudoId_fkey";
ALTER TABLE "Rain" DROP CONSTRAINT IF EXISTS "Rain_userId_fkey";
DROP INDEX IF EXISTS "Rain_kudoId_userId_key";
DROP INDEX IF EXISTS "Rain_kudoId_idx";
ALTER TABLE "Rain" RENAME TO "PileOn";
ALTER TABLE "PileOn" RENAME CONSTRAINT "Rain_pkey" TO "PileOn_pkey";
ALTER TABLE "PileOn" ALTER COLUMN "amount" DROP DEFAULT;
DELETE FROM "PileOn" WHERE "amount" <= 0;  -- empty accumulator rows carry no money
ALTER TABLE "PileOn" DROP COLUMN IF EXISTS "updatedAt";

-- ── 5. Drop single-tenant FKs and indexes, add company-aware ones ──────────
ALTER TABLE "Kudo"           DROP CONSTRAINT IF EXISTS "Kudo_fromId_fkey";
ALTER TABLE "Kudo"           DROP CONSTRAINT IF EXISTS "Kudo_toId_fkey";
ALTER TABLE "Reaction"       DROP CONSTRAINT IF EXISTS "Reaction_kudoId_fkey";
ALTER TABLE "Reaction"       DROP CONSTRAINT IF EXISTS "Reaction_userId_fkey";
ALTER TABLE "Redemption"     DROP CONSTRAINT IF EXISTS "Redemption_userId_fkey";
ALTER TABLE "Redemption"     DROP CONSTRAINT IF EXISTS "Redemption_rewardId_fkey";
ALTER TABLE "AuditLog"       DROP CONSTRAINT IF EXISTS "AuditLog_targetId_fkey";
ALTER TABLE "IncentiveClaim" DROP CONSTRAINT IF EXISTS "IncentiveClaim_userId_fkey";
ALTER TABLE "IncentiveClaim" DROP CONSTRAINT IF EXISTS "IncentiveClaim_incentiveId_fkey";

DROP INDEX IF EXISTS "Kudo_toId_createdAt_idx";
DROP INDEX IF EXISTS "Kudo_fromId_createdAt_idx";
DROP INDEX IF EXISTS "Kudo_createdAt_idx";
DROP INDEX IF EXISTS "TimeOff_start_end_idx";
DROP INDEX IF EXISTS "AuditLog_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_action_idx";
DROP INDEX IF EXISTS "AuditLog_actorId_idx";
DROP INDEX IF EXISTS "IncentiveClaim_userId_incentiveId_idx";
DROP INDEX IF EXISTS "IncentiveClaim_status_idx";

CREATE UNIQUE INDEX "Kudo_id_companyId_key" ON "Kudo"("id", "companyId");
CREATE INDEX "Kudo_companyId_createdAt_idx" ON "Kudo"("companyId", "createdAt");
CREATE INDEX "Kudo_companyId_toId_createdAt_idx" ON "Kudo"("companyId", "toId", "createdAt");
CREATE INDEX "Kudo_companyId_fromId_createdAt_idx" ON "Kudo"("companyId", "fromId", "createdAt");
CREATE INDEX "PileOn_companyId_kudoId_userId_idx" ON "PileOn"("companyId", "kudoId", "userId");
CREATE INDEX "PileOn_companyId_userId_createdAt_idx" ON "PileOn"("companyId", "userId", "createdAt");
CREATE INDEX "PileOn_companyId_createdAt_idx" ON "PileOn"("companyId", "createdAt");
CREATE INDEX "Reaction_companyId_idx" ON "Reaction"("companyId");
CREATE UNIQUE INDEX "Reward_id_companyId_key" ON "Reward"("id", "companyId");
CREATE INDEX "Reward_companyId_active_idx" ON "Reward"("companyId", "active");
CREATE INDEX "Redemption_companyId_status_idx" ON "Redemption"("companyId", "status");
CREATE INDEX "AllowanceReset_companyId_resetAt_idx" ON "AllowanceReset"("companyId", "resetAt");
CREATE INDEX "TimeOff_companyId_start_end_idx" ON "TimeOff"("companyId", "start", "end");
CREATE INDEX "IntegrationSync_companyId_source_lastRunAt_idx" ON "IntegrationSync"("companyId", "source", "lastRunAt");
CREATE UNIQUE INDEX "Incentive_id_companyId_key" ON "Incentive"("id", "companyId");
CREATE INDEX "Incentive_companyId_active_sortOrder_idx" ON "Incentive"("companyId", "active", "sortOrder");
CREATE INDEX "IncentiveClaim_companyId_userId_incentiveId_idx" ON "IncentiveClaim"("companyId", "userId", "incentiveId");
CREATE INDEX "IncentiveClaim_companyId_status_idx" ON "IncentiveClaim"("companyId", "status");
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt" DESC);
CREATE INDEX "AuditLog_companyId_action_idx" ON "AuditLog"("companyId", "action");

ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Kudo" ADD CONSTRAINT "Kudo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Kudo" ADD CONSTRAINT "Kudo_fromId_companyId_fkey" FOREIGN KEY ("fromId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Kudo" ADD CONSTRAINT "Kudo_toId_companyId_fkey" FOREIGN KEY ("toId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PileOn" ADD CONSTRAINT "PileOn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PileOn" ADD CONSTRAINT "PileOn_kudoId_companyId_fkey" FOREIGN KEY ("kudoId", "companyId") REFERENCES "Kudo"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PileOn" ADD CONSTRAINT "PileOn_userId_companyId_fkey" FOREIGN KEY ("userId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_kudoId_companyId_fkey" FOREIGN KEY ("kudoId", "companyId") REFERENCES "Kudo"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_companyId_fkey" FOREIGN KEY ("userId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_userId_companyId_fkey" FOREIGN KEY ("userId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_rewardId_companyId_fkey" FOREIGN KEY ("rewardId", "companyId") REFERENCES "Reward"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllowanceReset" ADD CONSTRAINT "AllowanceReset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllowanceReset" ADD CONSTRAINT "AllowanceReset_userId_companyId_fkey" FOREIGN KEY ("userId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationSync" ADD CONSTRAINT "IntegrationSync_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_userId_companyId_fkey" FOREIGN KEY ("userId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_incentiveId_companyId_fkey" FOREIGN KEY ("incentiveId", "companyId") REFERENCES "Incentive"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetId_companyId_fkey" FOREIGN KEY ("targetId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AuditLog_actorId_fkey (plain, actorId -> User.id) is kept as-is: a platform
-- owner from another company can be the actor on a company's audit row.

-- ── 6. Tidy: contiguous incentive order per company, new reward color default
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "sortOrder", "title", "id") - 1 AS rn
  FROM "Incentive"
)
UPDATE "Incentive" i SET "sortOrder" = o.rn FROM ordered o WHERE o.id = i.id;
ALTER TABLE "Reward" ALTER COLUMN "color" SET DEFAULT '#0f766e';

-- Item colors from LCED's palette (primary family only, never the mauve
-- accent): cycle Anchor Navy, Steady Navy, Quiet Steel, Ink in display order.
WITH r AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "cost", "title", "id") - 1 AS rn FROM "Reward" WHERE "companyId" = 'company_lced'
)
UPDATE "Reward" x SET "color" = (ARRAY['#14304d','#1f4368','#3e6792','#0b1b2d'])[(r.rn % 4) + 1]
  FROM r WHERE r.id = x.id;
WITH i AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "sortOrder", "title", "id") - 1 AS rn FROM "Incentive" WHERE "companyId" = 'company_lced'
)
UPDATE "Incentive" x SET "color" = (ARRAY['#14304d','#1f4368','#3e6792','#0b1b2d'])[(i.rn % 4) + 1]
  FROM i WHERE i.id = x.id;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification (run after COMMIT; every count in the first query should be 0)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT
--   (SELECT count(*) FROM "User"           WHERE "companyId" IS NULL) AS users_unscoped,
--   (SELECT count(*) FROM "Kudo" k JOIN "User" u ON u.id = k."toId" WHERE u."companyId" <> k."companyId") AS cross_company_kudos,
--   (SELECT count(*) FROM "User" WHERE role NOT IN ('admin','member')) AS bad_roles;
-- SELECT id, email, role, "isPlatformOwner" FROM "User" WHERE role = 'admin' OR "isPlatformOwner";
-- SELECT * FROM "Company";  SELECT * FROM "CompanyDomain";
-- SELECT sum(balance), sum("givingBalance") FROM "User";  -- compare with the same query BEFORE migrating

-- ════════════════════════════════════════════════════════════════════════════
-- Later, optional cleanup (not run): unused by Spotlight.
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TABLE "AppSetting";
-- DROP TABLE "BalanceAdjustment";
-- ALTER TABLE "User" DROP COLUMN "entity";
