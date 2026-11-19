import type { ScopedDb } from "@/lib/scopedDb"
import { activeIncentiveWhere, INCENTIVE_ORDER, INCENTIVE_PUBLIC_SELECT } from "@/lib/incentives"

/** Active, in-window incentives in the company's one admin-set order (Earn page). */
export function listActiveIncentives(sdb: ScopedDb, now: Date) {
  return sdb.incentive.findMany({ where: activeIncentiveWhere(now), orderBy: INCENTIVE_ORDER, select: INCENTIVE_PUBLIC_SELECT })
}

/** The top N of that same list (Home). N is the company's featuredIncentiveCount. */
export async function listFeaturedIncentives(sdb: ScopedDb, companyId: string, now: Date) {
  const company = await sdb.company.findUnique({ where: { id: companyId }, select: { featuredIncentiveCount: true } })
  const n = Math.max(0, company?.featuredIncentiveCount ?? 2)
  if (n === 0) return []
  return sdb.incentive.findMany({ where: activeIncentiveWhere(now), orderBy: INCENTIVE_ORDER, select: INCENTIVE_PUBLIC_SELECT, take: n })
}
