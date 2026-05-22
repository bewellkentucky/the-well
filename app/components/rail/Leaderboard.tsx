import { db } from "@/lib/db"
import { avatarColor } from "@/lib/avatarColor"

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

export default async function Leaderboard() {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const totals = await db.kudo.groupBy({
    by: ["fromId"],
    where: { createdAt: { gte: startOfMonth } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 5,
  })

  if (totals.length === 0) return null

  const users = await db.user.findMany({
    where: { id: { in: totals.map((t) => t.fromId) } },
    select: { id: true, fullName: true, title: true, email: true },
  })
  const byId = Object.fromEntries(users.map((u) => [u.id, u]))

  const rows = totals
    .map((t) => ({ user: byId[t.fromId], amount: t._sum.amount ?? 0 }))
    .filter((r) => r.user)

  return (
    <div className="card rail-section">
      <div className="card-header">
        <h2 className="card-title">This month</h2>
      </div>
      {rows.map((row, i) => (
        <div key={row.user.id} className="leaderboard-item">
          <div className={`rank${i < 3 ? " top" : ""}`}>{i + 1}</div>
          <div className={`avatar sm ${avatarColor(row.user.email)}`}>
            {initials(row.user.fullName)}
          </div>
          <div className="leader-info">
            <div className="leader-name">{row.user.fullName}</div>
            <div className="leader-meta">{row.user.title ?? ""}</div>
          </div>
          <div className="leader-points">{row.amount}d</div>
        </div>
      ))}
    </div>
  )
}
