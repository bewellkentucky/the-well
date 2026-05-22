import { db } from "@/lib/db"
import KudoCard from "./KudoCard"

// Mirrors the Workspace directory — same data shape the sync job will write.
// role: "owner" | "admin" | "member"
// birthday/hireDate: placeholder values until BambooHR integration runs.
// These only apply on first create — the update block never touches them so
// real BambooHR values are never overwritten by this seed.
const SEED_USERS: Array<{
  email: string; fullName: string; title: string; role: string
  birthday?: Date; hireDate?: Date
}> = [
  { email: "justin.wallen@bewellkentucky.com",   fullName: "Justin Wallen",   title: "Business Manager",        role: "owner",  birthday: new Date("1984-07-10"), hireDate: new Date("2015-03-01") },
  { email: "alecia.williams@bewellkentucky.com", fullName: "Alecia Williams", title: "Administrator",            role: "admin",  birthday: new Date("1990-08-22"), hireDate: new Date("2018-06-15") },
  { email: "callie.ernspiker@bewellkentucky.com",fullName: "Callie Ernspiker",title: "Practice Administrator",   role: "admin",  birthday: new Date("1988-06-01"), hireDate: new Date("2019-01-07") },
  { email: "megan.abrams@bewellkentucky.com",    fullName: "Megan Abrams",    title: "Administrator",            role: "admin",  birthday: new Date("1993-12-15"), hireDate: new Date("2021-08-09") },
  { email: "brenda.arellano@bewellkentucky.com", fullName: "Brenda Arellano", title: "Employee Engagement Lead", role: "admin",  birthday: new Date("1985-09-30"), hireDate: new Date("2020-06-22") },
  { email: "melissa.gibson@bewellkentucky.com",  fullName: "Melissa Gibson",  title: "Clinical Director",        role: "member", birthday: new Date("1979-05-28"), hireDate: new Date("2017-02-13") },
  { email: "hayley.meadows@bewellkentucky.com",  fullName: "Hayley Meadows",  title: "Associate Director",       role: "member", birthday: new Date("1991-03-17"), hireDate: new Date("2022-07-05") },
  { email: "tom.bivona@bewellkentucky.com",      fullName: "Tom Bivona",      title: "Therapist",                role: "member", birthday: new Date("1986-07-14"), hireDate: new Date("2023-09-11") },
  { email: "bryn.krivashei@bewellkentucky.com",  fullName: "Bryn Krivashei",  title: "Therapist",                role: "member", birthday: new Date("1994-11-03"), hireDate: new Date("2024-01-22") },
  { email: "emily.swartz@bewellkentucky.com",    fullName: "Emily Swartz",    title: "Clinician",                role: "member", birthday: new Date("1998-06-08"), hireDate: new Date("2025-04-14") },
]

const SEED_KUDOS = [
  {
    from: "melissa.gibson@bewellkentucky.com",
    to:   "hayley.meadows@bewellkentucky.com",
    amount: 25,
    message: "Hayley stepped in to cover three back-to-back intakes when we were short-staffed and never once made it feel like a burden. The clients were in great hands and the team felt it.",
    values: ["Team-First", "Compassion"],
  },
  {
    from: "callie.ernspiker@bewellkentucky.com",
    to:   "brenda.arellano@bewellkentucky.com",
    amount: 20,
    message: "Brenda pulled together the staff appreciation event in less than a week and it was genuinely one of the best ones we've done. Creative, organized, and completely on-brand for who she is.",
    values: ["Excellence", "Above & Beyond"],
  },
  {
    from: "hayley.meadows@bewellkentucky.com",
    to:   "tom.bivona@bewellkentucky.com",
    amount: 15,
    message: "Tom asked a question in supervision that reframed how the whole team was thinking about a tricky case. That kind of curiosity makes everyone better.",
    values: ["Curiosity", "Team-First"],
  },
  {
    from: "brenda.arellano@bewellkentucky.com",
    to:   "callie.ernspiker@bewellkentucky.com",
    amount: 30,
    message: "Callie caught a credentialing gap that would have been a real problem at audit and fixed it quietly before anyone else noticed. That's ownership.",
    values: ["Ownership", "Excellence"],
  },
  {
    from: "melissa.gibson@bewellkentucky.com",
    to:   "bryn.krivashei@bewellkentucky.com",
    amount: 20,
    message: "Bryn welcomed our new LCED hire like she'd been part of the team for years. That first-week experience matters more than we realize.",
    values: ["Compassion", "Team-First"],
  },
  {
    from: "alecia.williams@bewellkentucky.com",
    to:   "melissa.gibson@bewellkentucky.com",
    amount: 25,
    message: "Melissa rewrote the whole clinical onboarding checklist from scratch over the weekend because she saw it wasn't working. Nobody asked her to. That's above and beyond.",
    values: ["Above & Beyond", "Ownership"],
  },
] as const

async function seedIfNeeded() {
  // User upserts run every time — they're idempotent and need to backfill
  // new fields (birthday, hireDate) on existing rows without a full reseed.
  // create= full row on first insert
  // update= display fields + null-safe date backfill (never overwrites BambooHR data)
  for (const u of SEED_USERS) {
    await db.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email, fullName: u.fullName, title: u.title, role: u.role,
        domain: "bewellkentucky.com",
        ...(u.birthday && { birthday: u.birthday }),
        ...(u.hireDate && { hireDate: u.hireDate }),
      },
      update: { fullName: u.fullName, title: u.title },
    })
    // Backfill dates only when both are still null — safe once BambooHR runs.
    if (u.birthday || u.hireDate) {
      await db.user.updateMany({
        where: {
          email: u.email,
          birthday: null,
          hireDate: null,
        },
        data: {
          ...(u.birthday && { birthday: u.birthday }),
          ...(u.hireDate && { hireDate: u.hireDate }),
        },
      })
    }
  }

  // Kudo seed is guarded — only runs once on a fresh database.
  if (await db.kudo.count() > 0) return

  // Build email → id map
  const users = await db.user.findMany({
    where: { email: { in: SEED_KUDOS.flatMap((k) => [k.from, k.to]) } },
    select: { id: true, email: true },
  })
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u.id]))

  const now = new Date()
  for (let i = 0; i < SEED_KUDOS.length; i++) {
    const k = SEED_KUDOS[i]
    const fromId = byEmail[k.from]
    const toId   = byEmail[k.to]
    if (!fromId || !toId) continue
    // Deterministic ID + upsert makes this safe to run concurrently or repeatedly.
    await db.kudo.upsert({
      where: { id: `seed-kudo-${i}` },
      create: {
        id: `seed-kudo-${i}`,
        fromId,
        toId,
        amount: k.amount,
        message: k.message,
        values: [...k.values],
        createdAt: new Date(now.getTime() - i * 3_600_000),
      },
      update: {},
    })
  }
}

export default async function Feed({ currentUserId }: { currentUserId: string }) {
  await seedIfNeeded()

  const kudos = await db.kudo.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    where: {
      OR: [
        { isPrivate: false },
        { fromId: currentUserId },
        { toId: currentUserId },
      ],
    },
    include: {
      from: { select: { id: true, fullName: true, email: true, thumbnailUrl: true } },
      to:   { select: { id: true, fullName: true, email: true, thumbnailUrl: true } },
      reactions: { include: { user: { select: { id: true } } } },
    },
  })

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Recent recognition</h2>
      </div>
      {kudos.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--ink-soft)", textAlign: "center", padding: "32px 0" }}>
          No kudos yet. Be the first to recognize someone.
        </p>
      ) : (
        <div>
          {kudos.map((kudo) => (
            <KudoCard key={kudo.id} kudo={kudo} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </div>
  )
}
