import { db } from "@/lib/db"
import { scopedDb } from "@/lib/scopedDb"
import { formatStars } from "@/lib/brand"

/**
 * Reset every active person's giving allowance to their company's amount.
 * Per company, inside one transaction: givingBalance set, one AllowanceReset
 * ledger row per person, one IntegrationSync summary row. The earned wallet
 * (balance) is never touched.
 */
export async function resetAllowances(now = new Date()) {
  const companies = await db.company.findMany({ where: { active: true }, select: { id: true, allowanceAmount: true } })
  const results: { companyId: string; usersReset: number; amount: number }[] = []
  for (const c of companies) {
    const sdb = scopedDb(c.id)
    const usersReset = await sdb.$transaction(async (tx) => {
      const users = await tx.user.findMany({ where: { active: true }, select: { id: true } })
      if (users.length === 0) return 0
      await tx.user.updateMany({ where: { active: true }, data: { givingBalance: c.allowanceAmount } })
      await tx.allowanceReset.createMany({
        data: users.map((u) => ({ companyId: c.id, userId: u.id, amount: c.allowanceAmount, resetAt: now })),
      })
      await tx.integrationSync.create({
        data: {
          companyId: c.id,
          source: "allowance-reset",
          lastRunAt: now,
          recordsProcessed: users.length,
          notes: `Giving allowance reset to ${formatStars(c.allowanceAmount)} for ${users.length} people`,
        },
      })
      return users.length
    })
    results.push({ companyId: c.id, usersReset, amount: c.allowanceAmount })
  }
  return results
}
