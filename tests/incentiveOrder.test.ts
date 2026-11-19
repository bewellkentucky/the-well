import { describe, it, expect, beforeEach } from "vitest"
import { db } from "@/lib/db"
import { scopedDb } from "@/lib/scopedDb"
import { createIncentive, moveIncentive, setIncentiveActive } from "@/app/actions/adminIncentives"
import { setFeaturedCount } from "@/app/actions/adminProgram"
import { listActiveIncentives, listFeaturedIncentives } from "@/lib/incentiveQueries"
import { INCENTIVE_ORDER } from "@/lib/incentives"
import { resetDb, setActor, twoCompanies } from "./helpers"

beforeEach(resetDb)

const form = (title: string) => ({
  title, description: "d", reward: 10, verification: "self", cap: "once", icon: "⭐", color: "#c2410c",
  proofPrompt: null, startsAt: null, endsAt: null,
})

async function setup() {
  const t = await twoCompanies()
  setActor(t.aAdmin.id)
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) expect(await createIncentive(form(name))).toEqual({})
  return t
}
const titles = (rows: { title: string }[]) => rows.map((r) => r.title)

describe("admin-set incentive order", () => {
  it("new incentives go to the end; featured = top N (default 2)", async () => {
    const { a } = await setup()
    const sdb = scopedDb(a.id)
    expect(titles(await listActiveIncentives(sdb, new Date()))).toEqual(["Alpha", "Bravo", "Charlie", "Delta"])
    expect(titles(await listFeaturedIncentives(sdb, a.id, new Date()))).toEqual(["Alpha", "Bravo"])
  })

  it("moving changes the one order used by admin, Earn and Home", async () => {
    const { a } = await setup()
    const sdb = scopedDb(a.id)
    const delta = await db.incentive.findFirstOrThrow({ where: { title: "Delta" } })
    expect(await moveIncentive(delta.id, "up")).toEqual({})
    expect(await moveIncentive(delta.id, "up")).toEqual({})
    expect(await moveIncentive(delta.id, "up")).toEqual({})
    expect(await moveIncentive(delta.id, "up")).toEqual({}) // already first: no-op
    const admin = await sdb.incentive.findMany({ orderBy: INCENTIVE_ORDER })
    expect(titles(admin)).toEqual(["Delta", "Alpha", "Bravo", "Charlie"])
    expect(admin.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3])
    expect(titles(await listActiveIncentives(sdb, new Date()))).toEqual(titles(admin))
    expect(titles(await listFeaturedIncentives(sdb, a.id, new Date()))).toEqual(["Delta", "Alpha"])
  })

  it("featured count is a company setting; inactive incentives are skipped", async () => {
    const { a, b } = await setup()
    expect(await setFeaturedCount(3)).toEqual({})
    const bravo = await db.incentive.findFirstOrThrow({ where: { title: "Bravo" } })
    await setIncentiveActive(bravo.id, false)
    expect(titles(await listFeaturedIncentives(scopedDb(a.id), a.id, new Date()))).toEqual(["Alpha", "Charlie", "Delta"])
    expect(await listFeaturedIncentives(scopedDb(b.id), b.id, new Date())).toEqual([])
    expect(await setFeaturedCount(0)).toEqual({})
    expect(await listFeaturedIncentives(scopedDb(a.id), a.id, new Date())).toEqual([])
    expect((await setFeaturedCount(7)).error).toMatch(/0 to 6/)
  })

  it("concurrent moves keep the order contiguous", async () => {
    const { a } = await setup()
    const all = await db.incentive.findMany({ where: { companyId: a.id } })
    await Promise.all(all.map((i, k) => moveIncentive(i.id, k % 2 ? "up" : "down")))
    const orders = (await db.incentive.findMany({ where: { companyId: a.id }, orderBy: { sortOrder: "asc" } })).map((i) => i.sortOrder)
    expect(orders).toEqual([0, 1, 2, 3])
  })
})
