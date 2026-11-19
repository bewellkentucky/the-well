import type { ScopedDb } from "@/lib/scopedDb"

/**
 * Top givers since `since`: stars given in kudos plus stars piled on.
 * Ranks GIVERS (deliberate; see CLAUDE.md). Company-scoped via ScopedDb.
 */
export async function topGivers(sdb: ScopedDb, since: Date, limit = 5) {
  const [kudoTotals, pileTotals] = await Promise.all([
    sdb.kudo.groupBy({ by: ["fromId"], where: { createdAt: { gte: since } }, _sum: { amount: true } }),
    sdb.pileOn.groupBy({ by: ["userId"], where: { createdAt: { gte: since } }, _sum: { amount: true } }),
  ])
  const totals = new Map<string, number>()
  for (const k of kudoTotals) totals.set(k.fromId, (totals.get(k.fromId) ?? 0) + (k._sum.amount ?? 0))
  for (const p of pileTotals) totals.set(p.userId, (totals.get(p.userId) ?? 0) + (p._sum.amount ?? 0))
  const ranked = [...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
  if (ranked.length === 0) return []
  const users = await sdb.user.findMany({
    where: { id: { in: ranked.map(([id]) => id) } },
    select: { id: true, fullName: true, email: true, thumbnailUrl: true },
  })
  const byId = new Map(users.map((u) => [u.id, u]))
  return ranked.flatMap(([id, amount]) => {
    const user = byId.get(id)
    return user ? [{ user, amount }] : []
  })
}
