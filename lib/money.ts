// Money helpers shared by every server action that moves stars.
//
// Pattern (see CLAUDE.md "Money logic"):
//   1. One interactive transaction.
//   2. lockUsers() first: SELECT ... FOR UPDATE on every user row the
//      transaction will read or write, in id order (no deadlocks), filtered by
//      companyId (raw SQL is not auto-scoped).
//   3. Re-read balances / caps after the lock, validate, write.
//   4. Status changes use conditional updateMany(... status: "pending") and
//      require count === 1.
//   5. Audit row inside the same transaction.
//
// Postgres runs Prisma transactions at READ COMMITTED, so "re-read inside the
// transaction" alone does NOT stop two concurrent requests from both passing a
// balance check. The row lock does.

import type { ScopedTx } from "@/lib/scopedDb"
import { ActionError } from "@/lib/errors"

export async function lockUsers(tx: ScopedTx, companyId: string, userIds: string[]): Promise<void> {
  const ids = [...new Set(userIds)].sort()
  if (ids.length === 0) return
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User"
    WHERE "companyId" = ${companyId} AND id = ANY(${ids}::text[])
    ORDER BY id
    FOR UPDATE`
  if (rows.length !== ids.length) throw new ActionError("Person not found.")
}

/** Options for money transactions: wait a little longer for row locks under contention. */
export const MONEY_TX = { maxWait: 10_000, timeout: 20_000 } as const

export function assertPositiveInt(n: unknown, label: string, max = 100_000): number {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) throw new ActionError(`${label} must be a whole number of at least 1.`)
  if (n > max) throw new ActionError(`${label} is too large.`)
  return n
}
