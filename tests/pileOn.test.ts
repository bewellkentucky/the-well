import { describe, it, expect, beforeEach } from "vitest"
import { db } from "@/lib/db"
import { pileOn } from "@/app/actions/pileOn"
import { topGivers } from "@/lib/leaderboard"
import { scopedDb } from "@/lib/scopedDb"
import { PILE_ON_BUTTON, PILE_ON_CAP, PILE_ON_STEP, PILE_ON_MAX_TAPS } from "@/lib/brand"
import { resetDb, setActor, twoCompanies, makeKudo, balances } from "./helpers"

beforeEach(resetDb)

// a1 sends a kudo to a2; aAdmin is the third person who piles on.
async function setup() {
  const t = await twoCompanies()
  const kudo = await makeKudo(t.a.id, t.a1.id, t.a2.id, { amount: 10 })
  return { ...t, kudo }
}

describe("Pile on", () => {
  it("config: +5 per tap, max 5 taps, 25 cap, one label", () => {
    expect([PILE_ON_STEP, PILE_ON_MAX_TAPS, PILE_ON_CAP]).toEqual([5, 5, 25])
    expect(PILE_ON_BUTTON).toBe("Pile on +5 ⭐")
  })

  it("moves stars from the piler's allowance to the recipient's earned wallet, with an audit row", async () => {
    const { aAdmin, a2, kudo } = await setup()
    setActor(aAdmin.id)
    expect(await pileOn(kudo.id, 15)).toEqual({ newTotal: 15 })
    expect(await balances(aAdmin.id)).toEqual({ balance: 0, givingBalance: 85 })
    expect(await balances(a2.id)).toEqual({ balance: 15, givingBalance: 100 })
    expect(await db.auditLog.count({ where: { action: "pile_on", amount: 15 } })).toBe(1)
  })

  it("caps at 25 per person per kudo across several commits", async () => {
    const { aAdmin, a2, kudo } = await setup()
    setActor(aAdmin.id)
    expect(await pileOn(kudo.id, 20)).toEqual({ newTotal: 20 })
    expect((await pileOn(kudo.id, 10)).error).toMatch(/past the 25 ⭐ limit/)
    expect(await pileOn(kudo.id, 5)).toEqual({ newTotal: 25 })
    expect((await pileOn(kudo.id, 5)).error).toMatch(/limit/)
    expect((await balances(a2.id)).balance).toBe(25)
    expect((await balances(aAdmin.id)).givingBalance).toBe(75)
  })

  it("blocks going past the giving allowance", async () => {
    const { aAdmin, a2, kudo } = await setup()
    await db.user.update({ where: { id: aAdmin.id }, data: { givingBalance: 10 } })
    setActor(aAdmin.id)
    expect((await pileOn(kudo.id, 15)).error).toMatch(/Not enough stars to give/)
    expect(await balances(aAdmin.id)).toEqual({ balance: 0, givingBalance: 10 })
    expect((await balances(a2.id)).balance).toBe(0)
  })

  it("the recipient can't pile on a kudo they received", async () => {
    const { a2, kudo } = await setup()
    setActor(a2.id)
    expect((await pileOn(kudo.id, 5)).error).toMatch(/kudo you received/)
  })

  it("the original giver can't pile on their own kudo", async () => {
    const { a1, kudo } = await setup()
    setActor(a1.id)
    expect((await pileOn(kudo.id, 5)).error).toMatch(/your own kudo/)
  })

  it("not on private kudos", async () => {
    const { a, a1, a2, aAdmin } = await setup()
    const priv = await makeKudo(a.id, a1.id, a2.id, { isPrivate: true })
    setActor(aAdmin.id)
    expect((await pileOn(priv.id, 5)).error).toMatch(/private/)
  })

  it("rejects amounts the UI can't produce", async () => {
    const { aAdmin, kudo } = await setup()
    setActor(aAdmin.id)
    for (const bad of [0, 3, -5, 30, 7.5]) expect((await pileOn(kudo.id, bad)).error).toMatch(/Invalid/)
  })

  it("concurrent commits can't beat the cap or double-spend", async () => {
    const { aAdmin, a2, kudo } = await setup()
    setActor(aAdmin.id)
    const res = await Promise.all(Array.from({ length: 8 }, () => pileOn(kudo.id, 10)))
    expect(res.filter((r) => !r.error)).toHaveLength(2) // 10 + 10 = 20; a third would be 30
    expect((await balances(a2.id)).balance).toBe(20)
    expect((await balances(aAdmin.id)).givingBalance).toBe(80)
    const sum = await db.pileOn.aggregate({ _sum: { amount: true } })
    expect(sum._sum.amount).toBe(20)
  })

  it("concurrent commits can't beat the allowance", async () => {
    const { a, a1, a2, aAdmin } = await setup()
    await db.user.update({ where: { id: aAdmin.id }, data: { givingBalance: 25 } })
    const kudos = await Promise.all(Array.from({ length: 4 }, () => makeKudo(a.id, a1.id, a2.id)))
    setActor(aAdmin.id)
    const res = await Promise.all(kudos.map((k) => pileOn(k.id, 10)))
    expect(res.filter((r) => !r.error)).toHaveLength(2)
    expect((await balances(aAdmin.id)).givingBalance).toBe(5)
  })

  it("counts toward Top givers", async () => {
    const { a, a1, aAdmin, kudo } = await setup()
    setActor(aAdmin.id)
    await pileOn(kudo.id, 25)
    const leaders = await topGivers(scopedDb(a.id), new Date(Date.now() - 86400000))
    expect(leaders.map((l) => [l.user.id, l.amount])).toEqual([[aAdmin.id, 25], [a1.id, 10]])
  })
})
