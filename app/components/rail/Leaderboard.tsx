import { requireActor } from "@/lib/tenant"
import { topGivers } from "@/lib/leaderboard"
import { formatStars } from "@/lib/brand"
import Avatar from "@/app/components/ui/Avatar"

export default async function Leaderboard() {
  const actor = await requireActor()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const rows = await topGivers(actor.db, startOfMonth)
  if (rows.length === 0) return null

  return (
    <div className="card rail-section">
      <div className="card-header">
        <h2 className="card-title">Top givers this month</h2>
      </div>
      {rows.map((row, i) => (
        <div key={row.user.id} className="leaderboard-item">
          <div className={`rank${i < 3 ? " top" : ""}`}>{i + 1}</div>
          <Avatar name={row.user.fullName} email={row.user.email} thumbnailUrl={row.user.thumbnailUrl} size="sm" />
          <div className="leader-info">
            <div className="leader-name">{row.user.fullName}</div>
          </div>
          <div className="leader-points">{formatStars(row.amount)}</div>
        </div>
      ))}
    </div>
  )
}
