// Cross-company isolation. Every test tries to read or write another
// company's data and must fail (or see nothing).
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "@/lib/db"
import { scopedDb } from "@/lib/scopedDb"
import { getActor } from "@/lib/tenant"
import { topGivers } from "@/lib/leaderboard"
import { createKudo } from "@/app/actions/createKudo"
import { toggleReaction } from "@/app/actions/toggleReaction"
import { pileOn } from "@/app/actions/pileOn"
import { claimIncentive } from "@/app/actions/claimIncentive"
import { redeemReward } from "@/app/actions/redeemReward"
import {
  approveIncentiveClaim,
  declineIncentiveClaim,
  approveRedemption,
  declineRedemption,
} from "@/app/actions/adminApprovals"
import { adjustBalance, changeRole } from "@/app/actions/adminPeople"
import { updateReward, setRewardActive } from "@/app/actions/adminRewards"
import { updateIncentive, setIncentiveActive, moveIncentive } from "@/app/actions/adminIncentives"
import { setAllowanceSetting, setBranding, setFeaturedCount } from "@/app/actions/adminProgram"
import { createCompany, updateCompany } from "@/app/actions/platform"
import {
  resetDb, setActor, twoCompanies, makeKudo, makeIncentive, makeReward, balances, makeUser,
} from "./helpers"

beforeEach(resetDb)

describe("scoped client", () => {
  it("cannot find, update or delete another company's rows by id", async () => {
    const { a, b, b1, b2 } = await twoCompanies()
    const kudoB = await makeKudo(b.id, b1.id, b2.id)
    const sa = scopedDb(a.id)

    expect(await sa.kudo.findUnique({ where: { id: kudoB.id } })).toBeNull()
    expect(await sa.kudo.findFirst({ where: { id: kudoB.id } })).toBeNull()
    expect(await sa.user.findUnique({ where: { id: b1.id } })).toBeNull()
    expect(await sa.kudo.count()).toBe(0)
    expect((await sa.user.updateMany({ where: { id: b1.id }, data: { balance: 999 } })).count).toBe(0)
    await expect(sa.user.update({ where: { id: b1.id }, data: { balance: 999 } })).rejects.toThrow()
    expect((await sa.kudo.deleteMany({ where: { id: kudoB.id } })).count).toBe(0)
    expect((await balances(b1.id)).balance).toBe(0)
  })

  it("forces companyId on create even if the caller passes another one", async () => {
    const { a, b, a1, a2 } = await twoCompanies()
    const sa = scopedDb(a.id)
    const k = await sa.kudo.create({
      data: { companyId: b.id, fromId: a1.id, toId: a2.id, amount: 1, message: "x", values: ["Compassion"] },
    })
    expect(k.companyId).toBe(a.id)
  })

  it("never lets an update move a row to another company", async () => {
    const { a, b, a1 } = await twoCompanies()
    const sa = scopedDb(a.id)
    await sa.user.updateMany({ where: { id: a1.id }, data: { companyId: b.id, fullName: "Renamed" } as never })
    const row = await db.user.findUniqueOrThrow({ where: { id: a1.id } })
    expect(row.companyId).toBe(a.id)
    expect(row.fullName).toBe("Renamed")
  })

  it("database refuses a kudo linking people from two companies (composite FK)", async () => {
    const { a, a1, b1 } = await twoCompanies()
    await expect(
      db.kudo.create({ data: { companyId: a.id, fromId: a1.id, toId: b1.id, amount: 1, message: "x", values: [] } })
    ).rejects.toThrow()
  })

  it("database refuses a reaction from another company's person", async () => {
    const { a, a1, a2, b1 } = await twoCompanies()
    const k = await makeKudo(a.id, a1.id, a2.id)
    await expect(
      db.reaction.create({ data: { companyId: a.id, kudoId: k.id, userId: b1.id, emoji: "⭐" } })
    ).rejects.toThrow()
  })
})

describe("actor resolution", () => {
  it("comes from the database, so a deactivated person is refused", async () => {
    const { a1 } = await twoCompanies()
    setActor(a1.id)
    expect((await getActor())?.companyId).toBe(a1.companyId)
    await db.user.update({ where: { id: a1.id }, data: { active: false } })
    expect(await getActor()).toBeNull()
  })

  it("is refused when the company is deactivated", async () => {
    const { a, a1 } = await twoCompanies()
    await db.company.update({ where: { id: a.id }, data: { active: false } })
    setActor(a1.id)
    expect(await getActor()).toBeNull()
    expect((await createKudo({ toId: a1.id, amount: 1, message: "x", values: ["Compassion"], isPrivate: false }))?.error).toBe("Not signed in.")
  })

  it("loses admin rights as soon as the role changes in the DB", async () => {
    const { aAdmin, a1 } = await twoCompanies()
    setActor(aAdmin.id)
    expect(await adjustBalance(a1.id, 5, "thanks")).toEqual({})
    await db.user.update({ where: { id: aAdmin.id }, data: { role: "member" } })
    expect((await adjustBalance(a1.id, 5, "thanks")).error).toBe("Not authorized.")
  })
})

describe("staff actions across companies", () => {
  it("can't send a kudo to someone in another company", async () => {
    const { a1, b1 } = await twoCompanies()
    setActor(a1.id)
    const res = await createKudo({ toId: b1.id, amount: 10, message: "hi", values: ["Compassion"], isPrivate: false })
    expect(res?.error).toBe("Recipient not found.")
    expect(await balances(a1.id)).toEqual({ balance: 0, givingBalance: 100 })
    expect(await balances(b1.id)).toEqual({ balance: 0, givingBalance: 100 })
    expect(await db.kudo.count()).toBe(0)
  })

  it("can't react to another company's kudo", async () => {
    const { b, a1, b1, b2 } = await twoCompanies()
    const k = await makeKudo(b.id, b1.id, b2.id)
    setActor(a1.id)
    expect((await toggleReaction(k.id, "⭐"))?.error).toBe("Kudo not found.")
    expect(await db.reaction.count()).toBe(0)
  })

  it("can't pile on another company's kudo", async () => {
    const { b, a1, b1, b2 } = await twoCompanies()
    const k = await makeKudo(b.id, b1.id, b2.id)
    setActor(a1.id)
    expect((await pileOn(k.id, 5)).error).toBe("Kudo not found.")
    expect(await balances(a1.id)).toEqual({ balance: 0, givingBalance: 100 })
    expect(await balances(b2.id)).toEqual({ balance: 0, givingBalance: 100 })
  })

  it("can't claim another company's incentive", async () => {
    const { b, a1 } = await twoCompanies()
    const inc = await makeIncentive(b.id, { verification: "self", reward: 500 })
    setActor(a1.id)
    expect((await claimIncentive(inc.id)).error).toBe("Incentive not available.")
    expect((await balances(a1.id)).balance).toBe(0)
  })

  it("can't redeem another company's reward", async () => {
    const { b, a1 } = await twoCompanies()
    await db.user.update({ where: { id: a1.id }, data: { balance: 1000 } })
    const reward = await makeReward(b.id, { cost: 100 })
    setActor(a1.id)
    expect((await redeemReward(reward.id)).error).toBe("Reward not available.")
    expect((await balances(a1.id)).balance).toBe(1000)
  })
})

describe("admin actions across companies", () => {
  it("can't approve or decline another company's claim", async () => {
    const { b, aAdmin, b1 } = await twoCompanies()
    const inc = await makeIncentive(b.id, { verification: "admin", cap: "unlimited", reward: 300 })
    const claim = await db.incentiveClaim.create({
      data: { companyId: b.id, userId: b1.id, incentiveId: inc.id, status: "pending", rewardSnapshot: 300 },
    })
    setActor(aAdmin.id)
    expect((await approveIncentiveClaim(claim.id)).error).toBe("Claim not found.")
    expect((await declineIncentiveClaim(claim.id)).error).toBe("Claim not found.")
    expect((await db.incentiveClaim.findUniqueOrThrow({ where: { id: claim.id } })).status).toBe("pending")
    expect((await balances(b1.id)).balance).toBe(0)
  })

  it("can't approve or decline another company's redemption", async () => {
    const { b, aAdmin, b1 } = await twoCompanies()
    const reward = await makeReward(b.id, { cost: 100 })
    const r = await db.redemption.create({ data: { companyId: b.id, userId: b1.id, rewardId: reward.id, cost: 100 } })
    setActor(aAdmin.id)
    expect((await approveRedemption(r.id)).error).toBe("Redemption not found.")
    expect((await declineRedemption(r.id)).error).toBe("Redemption not found.")
    expect((await db.redemption.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("pending")
    expect((await balances(b1.id)).balance).toBe(0)
  })

  it("can't adjust a balance in another company", async () => {
    const { aAdmin, b1 } = await twoCompanies()
    setActor(aAdmin.id)
    expect((await adjustBalance(b1.id, 500, "gift")).error).toBe("Person not found.")
    expect((await balances(b1.id)).balance).toBe(0)
  })

  it("can't edit, disable or reorder another company's rewards and incentives", async () => {
    const { b, aAdmin } = await twoCompanies()
    const reward = await makeReward(b.id)
    const inc = await makeIncentive(b.id)
    setActor(aAdmin.id)
    const rewardForm = { title: "Hacked", description: "x", cost: 1, category: "Swag", inventory: null, icon: "🎁", color: "#c2410c" }
    expect((await updateReward(reward.id, rewardForm)).error).toBe("Reward not found.")
    expect((await setRewardActive(reward.id, false)).error).toBe("Reward not found.")
    const incForm = { title: "Hacked", description: "x", reward: 1, verification: "self", cap: "once", icon: "⭐", color: "#c2410c", proofPrompt: null, startsAt: null, endsAt: null }
    expect((await updateIncentive(inc.id, incForm)).error).toBe("Incentive not found.")
    expect((await setIncentiveActive(inc.id, false)).error).toBe("Incentive not found.")
    expect((await moveIncentive(inc.id, "down")).error).toBe("Incentive not found.")
    expect((await db.reward.findUniqueOrThrow({ where: { id: reward.id } })).title).not.toBe("Hacked")
    expect((await db.incentive.findUniqueOrThrow({ where: { id: inc.id } })).active).toBe(true)
  })

  it("settings only change the admin's own company", async () => {
    const { a, b, aAdmin } = await twoCompanies()
    setActor(aAdmin.id)
    expect(await setAllowanceSetting(250)).toEqual({})
    expect(await setFeaturedCount(4)).toEqual({})
    expect(await setBranding({ logoUrl: "https://example.com/a.png", brandColor: "#123456" })).toEqual({})
    const [ca, cb] = await Promise.all([
      db.company.findUniqueOrThrow({ where: { id: a.id } }),
      db.company.findUniqueOrThrow({ where: { id: b.id } }),
    ])
    expect([ca.allowanceAmount, ca.featuredIncentiveCount, ca.brandColor]).toEqual([250, 4, "#123456"])
    expect([cb.allowanceAmount, cb.featuredIncentiveCount, cb.brandColor]).toEqual([100, 2, null])
  })

  it("members can't use admin actions at all", async () => {
    const { a1, a2 } = await twoCompanies()
    setActor(a1.id)
    expect((await adjustBalance(a2.id, 5, "nope")).error).toBe("Not authorized.")
    expect((await setAllowanceSetting(1)).error).toBe("Not authorized.")
  })
})

describe("reads are company-scoped", () => {
  it("feed, directory, leaderboard and audit only show your own company", async () => {
    const { a, b, a1, a2, b1, b2 } = await twoCompanies()
    await makeKudo(a.id, a1.id, a2.id, { amount: 10 })
    await makeKudo(b.id, b1.id, b2.id, { amount: 50 })
    await db.auditLog.create({ data: { companyId: b.id, actorId: b1.id, actorName: "B", action: "give_kudo" } })
    setActor(a1.id)
    const actor = (await getActor())!
    const feed = await actor.db.kudo.findMany()
    expect(feed.map((k) => k.companyId)).toEqual([a.id])
    const people = await actor.db.user.findMany()
    expect(people.every((p) => p.companyId === a.id)).toBe(true)
    expect(people).toHaveLength(3)
    const leaders = await topGivers(actor.db, new Date(0))
    expect(leaders.map((l) => l.user.id)).toEqual([a1.id])
    expect(await actor.db.auditLog.count()).toBe(0)
  })
})

describe("roles and platform", () => {
  it("only a platform owner can change roles", async () => {
    const { aAdmin, a1 } = await twoCompanies()
    setActor(aAdmin.id)
    expect((await changeRole(a1.id, "admin")).error).toBe("Platform owner only.")
    expect((await db.user.findUniqueOrThrow({ where: { id: a1.id } })).role).toBe("member")
  })

  it("a platform owner can change roles in any company, and the audit row lands in that company", async () => {
    const { a, b, b1 } = await twoCompanies()
    const owner = await makeUser(a.id, { role: "admin", isPlatformOwner: true })
    setActor(owner.id)
    expect(await changeRole(b1.id, "admin")).toEqual({})
    expect((await db.user.findUniqueOrThrow({ where: { id: b1.id } })).role).toBe("admin")
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "change_role" } })
    expect(audit.companyId).toBe(b.id)
  })

  it("won't remove a company's last admin", async () => {
    const { a, bAdmin } = await twoCompanies()
    const owner = await makeUser(a.id, { role: "admin", isPlatformOwner: true })
    setActor(owner.id)
    expect((await changeRole(bAdmin.id, "member")).error).toMatch(/last admin/)
  })

  it("non-owners can't create or edit companies", async () => {
    const { b, aAdmin } = await twoCompanies()
    setActor(aAdmin.id)
    const input = { name: "Evil", slug: "evil", domains: "bravo.test", appUrl: null, logoUrl: null, brandColor: null, bambooEnabled: false, bambooSubdomain: null, chatSpace: null, active: true }
    expect((await createCompany(input)).error).toBe("Platform owner only.")
    expect((await updateCompany(b.id, input)).error).toBe("Platform owner only.")
  })

  it("a domain can belong to only one company", async () => {
    const { a } = await twoCompanies()
    const owner = await makeUser(a.id, { role: "admin", isPlatformOwner: true })
    setActor(owner.id)
    const input = { name: "Copycat", slug: "copycat", domains: "bravo.test", appUrl: null, logoUrl: null, brandColor: null, bambooEnabled: false, bambooSubdomain: null, chatSpace: null, active: true }
    expect((await createCompany(input)).error).toMatch(/Already used by another company: bravo.test/)
  })
})
