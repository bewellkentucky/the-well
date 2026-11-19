// Tenant isolation. Read this before touching data access.
//
// 1. requireActor() resolves the signed-in person FROM THE DATABASE on every
//    call (never from the JWT, never from the client) and returns their
//    companyId, role and a scoped client.
// 2. scopedDb(companyId) wraps Prisma so every query on a tenant model gets
//    companyId forced into `where` (reads, updates, deletes, counts, groupBy)
//    and into `data` (creates, upserts). A record id from another company
//    simply does not exist from inside a scoped client.
// 3. Raw SQL ($queryRaw / $executeRaw) is NOT scoped. Every raw statement must
//    filter on companyId by hand (see lib/money.ts).
// 4. The unscoped `db` from lib/db.ts may only be imported by the allowlisted
//    files in tests/unscoped-db.test.ts.

import { auth } from "@/auth"
import { db } from "@/lib/db"

export { scopedDb, TENANT_MODELS } from "@/lib/scopedDb"
export type { ScopedDb, ScopedTx } from "@/lib/scopedDb"
export { ActionError, TenantError } from "@/lib/errors"
import { scopedDb, type ScopedDb } from "@/lib/scopedDb"
import { canUseCompany } from "@/lib/launch"
import { isBlockedSignIn } from "@/lib/blockedSignIns"
import { ActionError, TenantError } from "@/lib/errors"

export type Actor = {
  userId: string
  companyId: string
  fullName: string
  role: string
  isPlatformOwner: boolean
  /** Spotlight admin for their own company (platform owners included). */
  isAdmin: boolean
  db: ScopedDb
}

/**
 * The signed-in, active person in an active company, or null. Always re-read
 * from the DB. While the company is closed (lib/launch.ts), only platform
 * owners, admins and testers resolve.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      companyId: true,
      fullName: true,
      role: true,
      active: true,
      isPlatformOwner: true,
      isTester: true,
      email: true,
      company: { select: { active: true, isOpen: true, blockedSignIns: true } },
    },
  })
  if (!user || !user.active || !user.company.active) return null
  // Launch switch: a session from before the company closed gets nothing.
  if (!canUseCompany(user.company, user)) return null
  // Blocked address (shared mailbox): never an actor, open or closed.
  if (isBlockedSignIn(user.company, user.email)) return null
  return {
    userId: user.id,
    companyId: user.companyId,
    fullName: user.fullName,
    role: user.role,
    isPlatformOwner: user.isPlatformOwner,
    isAdmin: user.role === "admin" || user.isPlatformOwner,
    db: scopedDb(user.companyId),
  }
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) throw new TenantError("Not signed in.")
  return actor
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await requireActor()
  if (!actor.isAdmin) throw new TenantError("Not authorized.")
  return actor
}

export async function requirePlatformOwner(): Promise<Actor> {
  const actor = await requireActor()
  if (!actor.isPlatformOwner) throw new TenantError("Platform owner only.")
  return actor
}

/**
 * Converts a thrown error into the `{ error }` shape server actions return.
 * Only our own ActionError / TenantError messages reach the browser; anything
 * else (Prisma, network) is logged without message content and replaced with
 * the fallback, so internals and kudo text never leak.
 */
export function toActionError(e: unknown, fallback = "Something went wrong. Please try again."): { error: string } {
  if (e instanceof ActionError || e instanceof TenantError) return { error: e.message }
  const code = (e as { code?: string })?.code
  console.error("[action error]", code ?? (e instanceof Error ? e.name : typeof e))
  return { error: fallback }
}
