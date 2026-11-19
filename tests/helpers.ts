import { session } from "./setup"
import { db } from "@/lib/db"
import { truncateAllTables } from "@/lib/devTruncate"

export function setActor(userId: string | null) {
  session.userId = userId
}

export async function resetDb() {
  setActor(null)
  await truncateAllTables()
}

let n = 0
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`

export async function makeCompany(slug: string, domains: string[] = [`${slug}.test`], extra: Record<string, unknown> = {}) {
  // Open by default so tests exercise normal use; pass { isOpen: false } for the launch switch.
  const company = await db.company.create({ data: { slug, name: slug.toUpperCase(), isOpen: true, ...extra } })
  for (const domain of domains) await db.companyDomain.create({ data: { domain, companyId: company.id } })
  return company
}

export async function makeUser(
  companyId: string,
  opts: Partial<{ role: string; isPlatformOwner: boolean; isTester: boolean; givingBalance: number; balance: number; active: boolean; email: string; googleId: string; fullName: string }> = {}
) {
  const id = uid()
  return db.user.create({
    data: {
      companyId,
      email: opts.email ?? `p${id}@${companyId}.test`,
      fullName: opts.fullName ?? `Person ${id}`,
      role: opts.role ?? "member",
      isPlatformOwner: opts.isPlatformOwner ?? false,
      isTester: opts.isTester ?? false,
      givingBalance: opts.givingBalance ?? 100,
      balance: opts.balance ?? 0,
      active: opts.active ?? true,
      googleId: opts.googleId,
    },
  })
}

export async function makeKudo(companyId: string, fromId: string, toId: string, extra: Partial<{ amount: number; isPrivate: boolean }> = {}) {
  return db.kudo.create({
    data: { companyId, fromId, toId, amount: extra.amount ?? 10, message: "Thanks!", values: ["Compassion"], isPrivate: extra.isPrivate ?? false },
  })
}

export async function makeIncentive(companyId: string, extra: Record<string, unknown> = {}) {
  return db.incentive.create({
    data: {
      companyId,
      title: `Incentive ${uid()}`,
      description: "Do the thing",
      reward: 50,
      verification: "self",
      cap: "once",
      icon: "⭐",
      color: "#c2410c",
      ...extra,
    },
  })
}

export async function makeReward(companyId: string, extra: Record<string, unknown> = {}) {
  return db.reward.create({
    data: { companyId, title: `Reward ${uid()}`, description: "Nice", cost: 100, category: "Swag", ...extra },
  })
}

export async function balances(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true, givingBalance: true } })
  return u
}

/** Two companies, each with an admin and two members. */
export async function twoCompanies() {
  const a = await makeCompany("alpha", ["alpha.test"])
  const b = await makeCompany("bravo", ["bravo.test"])
  const aAdmin = await makeUser(a.id, { role: "admin", fullName: "Alpha Admin" })
  const a1 = await makeUser(a.id, { fullName: "Alpha One" })
  const a2 = await makeUser(a.id, { fullName: "Alpha Two" })
  const bAdmin = await makeUser(b.id, { role: "admin", fullName: "Bravo Admin" })
  const b1 = await makeUser(b.id, { fullName: "Bravo One" })
  const b2 = await makeUser(b.id, { fullName: "Bravo Two" })
  return { a, b, aAdmin, a1, a2, bAdmin, b1, b2 }
}
