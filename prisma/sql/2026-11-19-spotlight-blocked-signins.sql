-- ════════════════════════════════════════════════════════════════════════════
-- Spotlight: blocked sign-in addresses (shared mailboxes). LCED only.
--
-- Run AFTER 2026-11-19-spotlight-multitenant.sql (it needs the Company table
-- and the company_lced row). Safe to run more than once, and safe whether or
-- not the fresh-start script has run.
--
-- Adds Company."blockedSignIns" (lowercase full addresses). A blocked address
-- can never sign in or become a Spotlight person, whether the company is open
-- or closed (lib/blockedSignIns.ts). Seeds LCED's shared mailboxes on both
-- domains. Does NOT deactivate any existing user row for these addresses:
-- the check at the bottom lists them so you can deactivate by hand.
-- Editable afterwards by the platform owner in /platform (audit-logged).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Nullable with a default, exactly as Prisma creates a String[] column.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "blockedSignIns" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Merge (never drop entries someone already added in /platform), sorted and
-- unique. Writes the audit row only when the list actually changes, so a
-- second run is a no-op.
DO $$
DECLARE
  before_list TEXT[];
  after_list  TEXT[];
BEGIN
  SELECT coalesce("blockedSignIns", ARRAY[]::TEXT[]) INTO before_list FROM "Company" WHERE id = 'company_lced';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'company_lced not found: run 2026-11-19-spotlight-multitenant.sql first';
  END IF;
  SELECT ARRAY(SELECT DISTINCT e FROM unnest(before_list || ARRAY[
           'intake@bewellkentucky.com', 'intake@lcedky.com',
           'reception@bewellkentucky.com', 'reception@lcedky.com',
           'support@bewellkentucky.com', 'support@lcedky.com'
         ]) AS e ORDER BY e)
    INTO after_list;
  IF after_list IS DISTINCT FROM ARRAY(SELECT e FROM unnest(before_list) AS e ORDER BY e) THEN
    UPDATE "Company" SET "blockedSignIns" = after_list, "updatedAt" = CURRENT_TIMESTAMP WHERE id = 'company_lced';
    -- Attributed to the earliest platform owner (same as the fresh start).
    INSERT INTO "AuditLog" ("id", "companyId", "actorId", "actorName", "action", "details")
    SELECT 'audit_blocked_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20),
           'company_lced', u.id, u."fullName", 'set_blocked_signins',
           'Blocked: ' || array_to_string(ARRAY(SELECT unnest(after_list) EXCEPT SELECT unnest(before_list) ORDER BY 1), ', ')
      FROM "User" u
     WHERE u."isPlatformOwner"
     ORDER BY u."createdAt"
     LIMIT 1;
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Check. Expect 6 blocked addresses. The second query lists any EXISTING
-- user rows for blocked addresses (they can no longer sign in or act, but
-- still appear in people lists until deactivated). Deactivate, never delete:
--   UPDATE "User" SET active = false, "updatedAt" = CURRENT_TIMESTAMP
--    WHERE "companyId" = 'company_lced'
--      AND email = ANY ((SELECT "blockedSignIns" FROM "Company" WHERE id = 'company_lced'));
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT array_length("blockedSignIns", 1) AS blocked, "blockedSignIns" FROM "Company" WHERE id = 'company_lced';
-- SELECT email, active, ("googleId" IS NOT NULL) AS google_linked
--   FROM "User"
--  WHERE "companyId" = 'company_lced'
--    AND email = ANY ((SELECT "blockedSignIns" FROM "Company" WHERE id = 'company_lced'));
