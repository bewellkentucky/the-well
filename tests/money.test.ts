// Money logic: atomic transactions, server-side allowance / balance / cap
// checks, audit rows written in the same transaction, and no double-spend
// under concurrent requests.
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "@/lib/db"
import { createKudo } from "@/app/actions/createKudo"
import { redeemReward } from "@/app/actions/redeemReward"
import { claimIncentive } from "@/app/actions/claimIncentive"
import { approveIncentiveClaim, declineRedemption } from "@/app/actions/adminApprovals"
import { adjustBalance } from "@/app/actions/adminPeople"
import { resetAllowances } from "@/lib/allowanceReset"
import { blockingClaim, capPeriodStart, isInWindow } from "@/lib/incentives"
import { resetDb, setActor, twoCompanies, makeIncentive, makeReward, balances, makeUser } from "./helpers"

beforeEach(resetDb)

const kudo = (toId: string, amount: number) =>
  createKudo({ toId, amount, message: "Thank you", values: ["Compassion"], isPrivate: false })

describe("kudos", () => {
  it("moves stars from giving allowance to earned wallet and writes an audit row in the same transaction", async () => {
    const { a1, a2 } = await twoCompanies()
    setActor(a1.id)
    expect(await kudo(a2.id, 30)).toBeUndefined()
    expect(await balances(a1.id)).toEqual({ balance: 0, givingBalance: 70 })
    expect(await balances(a2.id)).toEqual({ balance: 30, givingBalance: 100 })
    const audit = await db.auditLog.findMany({ where: { action: "give_kudo" } })
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ actorId: a1.id, targetId: a2.id, amount: 30 })
    expect(audit[0].details).not.toContain("Thank you") // never log message text
  })

  it("refuses more than the giving allowance and changes nothing", async () => {
    const { a1, a2 } = await twoCompanies()
    setActor(a1.id)
    expect((await kudo(a2.id, 101))?.error).toMatch(/only have 100/)
    expect(await balances(a1.id)).toEqual({ balance: 0, givingBalance: 100 })
    expect(await db.kudo.count()).toBe(0)
    expect(await db.auditLog.count()).toBe(0)
  })

  it("concurrent sends can't overspend the allowance", async () => {
    const { a1, a2 } = await twoCompanies()
    setActor(a1.id)
    const results = await Promise.all(Array.from({ length: 10 }, () => kudo(a2.id, 20)))
    const ok = results.filter((r) => r === undefined).length
    expect(ok).toBe(5)
    expect(await balances(a1.id)).toEqual({ balance: 0, givingBalance: 0 })
    expect((await balances(a2.id)).balance).toBe(100)
    expect(await db.kudo.count()).toBe(5)
    expect(await db.auditLog.count({ where: { action: "give_kudo" } })).toBe(5)
  })

  it("rejects bad input on the server", async () => {
    const { a1, a2 } = await twoCompanies()
    setActor(a1.id)
    expect((await kudo(a2.id, 0))?.error).toBe("Minimum 1 star.")
    expect((await kudo(a2.id, 2.5))?.error).toBe("Minimum 1 star.")
    expect((await kudo(a1.id, 5))?.error).toMatch(/yourself/)
    expect((await createKudo({ toId: a2.id, amount: 5, message: "x", values: ["Speed"], isPrivate: false }))?.error).toBe("Invalid value.")
    const inactive = await makeUser(a1.companyId, { active: false })
    expect((await kudo(inactive.id, 5))?.error).toBe("Recipient not found.")
  })
})

describe("rewards", () => {
  it("concurrent redemptions can't overspend the earned wallet", async () => {
    const { a, a1 } = await twoCompanies()
    await db.user.update({ where: { id: a1.id }, data: { balance: 250 } })
    const reward = await makeReward(a.id, { cost: 100 })
    setActor(a1.id)
    const results = await Promise.all(Array.from({ length: 5 }, () => redeemReward(reward.id)))
    expect(results.filter((r) => !r.error)).toHaveLength(2)
    expect((await balances(a1.id)).balance).toBe(50)
    expect(await db.redemption.count()).toBe(2)
    expect(await db.auditLog.count({ where: { action: "redeem_reward" } })).toBe(2)
  })

  it("inventory never goes below zero under concurrency", async () => {
    const { a, a1, a2 } = await twoCompanies()
    await db.user.updateMany({ where: { id: { in: [a1.id, a2.id] } }, data: { balance: 1000 } })
    const reward = await makeReward(a.id, { cost: 100, inventory: 1 })
    const attempt = async (id: string) => { setActor(id); return redeemReward(reward.id) }
    // Run sequentially-started but overlapping by alternating the mocked session.
    setActor(a1.id)
    const p1 = redeemReward(reward.id)
    setActor(a2.id)
    const p2 = redeemReward(reward.id)
    const res = await Promise.all([p1, p2])
    expect(res.filter((r) => !r.error)).toHaveLength(1)
    expect((await db.reward.findUniqueOrThrow({ where: { id: reward.id } })).inventory).toBe(0)
    expect((await attempt(a1.id)).error).toBe("This reward is out of stock.")
  })

  it("a declined redemption refunds the snapshot cost exactly once and restocks", async () => {
    const { a, aAdmin, a1 } = await twoCompanies()
    await db.user.update({ where: { id: a1.id }, data: { balance: 500 } })
    const reward = await makeReward(a.id, { cost: 200, inventory: 3 })
    setActor(a1.id)
    expect(await redeemReward(reward.id)).toEqual({})
    await db.reward.update({ where: { id: reward.id }, data: { cost: 999 } }) // price edit later
    const r = await db.redemption.findFirstOrThrow()
    setActor(aAdmin.id)
    const res = await Promise.all([declineRedemption(r.id), declineRedemption(r.id), declineRedemption(r.id)])
    expect(res.filter((x) => !x.error)).toHaveLength(1)
    expect((await balances(a1.id)).balance).toBe(500)
    expect((await db.reward.findUniqueOrThrow({ where: { id: reward.id } })).inventory).toBe(3)
  })
})

describe("incentives", () => {
  it("unlimited incentives can be claimed again and again (self-attest)", async () => {
    const { a, a1 } = await twoCompanies()
    const inc = await makeIncentive(a.id, { cap: "unlimited", verification: "self", reward: 40 })
    setActor(a1.id)
    for (let i = 0; i < 3; i++) expect(await claimIncentive(inc.id)).toEqual({ status: "credited" })
    expect((await balances(a1.id)).balance).toBe(120)
    expect(await db.incentiveClaim.count()).toBe(3)
  })

  it("unlimited admin-review incentives can be submitted again while one is pending", async () => {
    const { a, a1 } = await twoCompanies()
    const inc = await makeIncentive(a.id, { cap: "unlimited", verification: "admin", reward: 200 })
    setActor(a1.id)
    expect(await claimIncentive(inc.id, "first")).toEqual({ status: "pending" })
    expect(await claimIncentive(inc.id, "second")).toEqual({ status: "pending" })
    expect((await balances(a1.id)).balance).toBe(0)
    expect(await db.incentiveClaim.count({ where: { status: "pending" } })).toBe(2)
  })

  it("a 'once' incentive locks after the first claim, even with concurrent submits", async () => {
    const { a, a1 } = await twoCompanies()
    const inc = await makeIncentive(a.id, { cap: "once", verification: "self", reward: 500 })
    setActor(a1.id)
    const res = await Promise.all(Array.from({ length: 6 }, () => claimIncentive(inc.id)))
    expect(res.filter((r) => r.status === "credited")).toHaveLength(1)
    expect(res.filter((r) => r.error).every((r) => /already claimed/.test(r.error!))).toBe(true)
    expect((await balances(a1.id)).balance).toBe(500)
  })

  it("monthly and quarterly caps lock within the period; a declined claim does not count", async () => {
    const { a, a1 } = await twoCompanies()
    const monthly = await makeIncentive(a.id, { cap: "monthly", verification: "admin" })
    const quarterly = await makeIncentive(a.id, { cap: "quarterly", verification: "self" })
    setActor(a1.id)
    expect(await claimIncentive(monthly.id)).toEqual({ status: "pending" })
    expect((await claimIncentive(monthly.id)).error).toMatch(/already claimed/)
    await db.incentiveClaim.updateMany({ where: { incentiveId: monthly.id }, data: { status: "declined" } })
    expect(await claimIncentive(monthly.id)).toEqual({ status: "pending" })
    expect(await claimIncentive(quarterly.id)).toEqual({ status: "credited" })
    expect((await claimIncentive(quarterly.id)).error).toMatch(/already claimed/)
  })

  it("approval credits the snapshot, once, even if two admins click together", async () => {
    const { a, aAdmin, a1 } = await twoCompanies()
    const inc = await makeIncentive(a.id, { cap: "unlimited", verification: "admin", reward: 300 })
    setActor(a1.id)
    await claimIncentive(inc.id)
    await db.incentive.update({ where: { id: inc.id }, data: { reward: 999 } })
    const claim = await db.incentiveClaim.findFirstOrThrow()
    setActor(aAdmin.id)
    const res = await Promise.all([approveIncentiveClaim(claim.id), approveIncentiveClaim(claim.id)])
    expect(res.filter((r) => !r.error)).toHaveLength(1)
    expect((await balances(a1.id)).balance).toBe(300)
    expect(await db.auditLog.count({ where: { action: "approve_claim" } })).toBe(1)
  })

  it("refuses inactive and out-of-window incentives", async () => {
    const { a, a1 } = await twoCompanies()
    const off = await makeIncentive(a.id, { active: false })
    const future = await makeIncentive(a.id, { startsAt: new Date(Date.now() + 86400000) })
    const past = await makeIncentive(a.id, { endsAt: new Date(Date.now() - 86400000) })
    setActor(a1.id)
    expect((await claimIncentive(off.id)).error).toBe("Incentive not available.")
    expect((await claimIncentive(future.id)).error).toMatch(/hasn't started/)
    expect((await claimIncentive(past.id)).error).toMatch(/has ended/)
  })

  it("shared rules: blockingClaim / capPeriodStart / isInWindow", () => {
    const now = new Date(Date.UTC(2026, 10, 19, 12)) // Nov 19
    const c = (iso: string, status = "credited") => ({ incentiveId: "i", status, createdAt: new Date(iso) })
    expect(blockingClaim("unlimited", [c("2026-11-18")], now)).toBeNull()
    expect(blockingClaim("once", [c("2020-01-01")], now)).not.toBeNull()
    expect(blockingClaim("once", [c("2020-01-01", "declined")], now)).toBeNull()
    expect(blockingClaim("monthly", [c("2026-10-31")], now)).toBeNull()
    expect(blockingClaim("monthly", [c("2026-11-01")], now)).not.toBeNull()
    expect(blockingClaim("quarterly", [c("2026-09-30")], now)).toBeNull()
    expect(blockingClaim("quarterly", [c("2026-10-01")], now)).not.toBeNull()
    expect(blockingClaim("weird-cap", [c("2026-11-01")], now)).not.toBeNull() // fail closed
    expect(capPeriodStart("quarterly", now)?.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(isInWindow({ id: "i", cap: "once", endsAt: now }, now)).toBe(true) // inclusive end
  })
})

describe("admin adjustments and resets", () => {
  it("can't deduct below zero; adjustments are audited", async () => {
    const { aAdmin, a1 } = await twoCompanies()
    await db.user.update({ where: { id: a1.id }, data: { balance: 50 } })
    setActor(aAdmin.id)
    expect((await adjustBalance(a1.id, -51, "oops")).error).toMatch(/Can't deduct/)
    expect(await adjustBalance(a1.id, -50, "correction")).toEqual({})
    expect((await balances(a1.id)).balance).toBe(0)
    expect(await db.auditLog.count({ where: { action: "adjust_balance" } })).toBe(1)
    expect((await adjustBalance(a1.id, 5, "")).error).toMatch(/reason/)
  })

  it("allowance reset uses each company's own amount and never touches earned stars", async () => {
    const { a, b, a1, b1 } = await twoCompanies()
    await db.company.update({ where: { id: a.id }, data: { allowanceAmount: 150 } })
    await db.company.update({ where: { id: b.id }, data: { allowanceAmount: 40 } })
    await db.user.updateMany({ data: { givingBalance: 3, balance: 77 } })
    await resetAllowances()
    expect(await balances(a1.id)).toEqual({ balance: 77, givingBalance: 150 })
    expect(await balances(b1.id)).toEqual({ balance: 77, givingBalance: 40 })
    expect(await db.allowanceReset.count({ where: { companyId: a.id } })).toBe(3)
  })
})
