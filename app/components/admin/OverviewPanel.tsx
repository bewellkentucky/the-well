import Link from "next/link"

export type OverviewData = {
  totalUsers: number
  earnedOutstanding: number
  participationRate: number
  totalKudos: number
  uniqueGivers: number
  noKudosCount: number
  pendingCount: number
  lastSync: { lastRunAt: string; errors: number; recordsProcessed: number } | null
  recentHireCount: number
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)    return "just now"
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function OverviewPanel({ data }: { data: OverviewData }) {
  const {
    totalUsers, earnedOutstanding, participationRate, totalKudos,
    uniqueGivers, noKudosCount, pendingCount, lastSync, recentHireCount,
  } = data

  const pct = Math.round(participationRate * 100)

  // Build needs-attention flags in priority order
  type Flag = { level: "warn" | "info"; message: string; href?: string }
  const flags: Flag[] = []

  if (pendingCount > 0) {
    flags.push({
      level: "warn",
      message: `${pendingCount} pending ${pendingCount === 1 ? "approval" : "approvals"} — ${pendingCount === 1 ? "a claim or redemption needs" : "claims or redemptions need"} review.`,
      href: "/admin?tab=approvals",
    })
  }

  if (lastSync === null) {
    flags.push({
      level: "warn",
      message: "BambooHR has never been synced. Staff data (location, title, hire date) is missing.",
      href: "/admin?tab=integrations",
    })
  } else if (lastSync.errors > 0) {
    flags.push({
      level: "warn",
      message: `BambooHR last sync had ${lastSync.errors} ${lastSync.errors === 1 ? "error" : "errors"} (${timeAgo(lastSync.lastRunAt)}).`,
      href: "/admin?tab=integrations",
    })
  } else {
    flags.push({
      level: "info",
      message: `BambooHR synced ${timeAgo(lastSync.lastRunAt)} — ${lastSync.recordsProcessed} ${lastSync.recordsProcessed === 1 ? "record" : "records"} processed, no errors.`,
    })
  }

  if (recentHireCount > 0) {
    flags.push({
      level: "info",
      message: `${recentHireCount} staff member${recentHireCount === 1 ? "" : "s"} joined in the last 30 days — verify ${recentHireCount === 1 ? "they have" : "they have all"} logged in.`,
    })
  }

  if (noKudosCount > 0) {
    flags.push({
      level: "info",
      message: `${noKudosCount} of ${totalUsers} accounts haven't sent a kudo yet.`,
    })
  }

  const hasWarnings = flags.some((f) => f.level === "warn")

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Stat row ──────────────────────────────────────────── */}
      <div className="overview-stats">

        <Link href="/admin?tab=approvals" className="stat-card stat-card-link">
          <div className={`stat-value${pendingCount > 0 ? " stat-value-warn" : ""}`}>
            {pendingCount}
          </div>
          <div className="stat-label">Pending approvals</div>
          <div className="stat-sub">claims + redemptions waiting</div>
        </Link>

        <div className="stat-card">
          <div className="stat-value">
            {earnedOutstanding.toLocaleString()}đ
          </div>
          <div className="stat-label">Drops earned, unspent</div>
          <div className="stat-sub">earned wallet balance, all staff</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{pct}%</div>
          <div className="stat-label">Participation</div>
          <div className="stat-sub">
            {uniqueGivers} of {totalUsers} accounts gave a kudo
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{totalKudos.toLocaleString()}</div>
          <div className="stat-label">Kudos sent</div>
          <div className="stat-sub">since launch</div>
        </div>

      </div>

      {/* ── Alert row ─────────────────────────────────────────── */}
      <div className="alert-row">

        {/* Needs attention */}
        <div className="card" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-header">
            <h2 className="card-title">Needs attention</h2>
            {hasWarnings && (
              <span className="overview-warn-badge">!</span>
            )}
          </div>

          {flags.length === 0 ? (
            <p className="overview-all-good">Nothing needs attention right now.</p>
          ) : (
            <div className="alert-list">
              {flags.map((flag, i) => (
                <div key={i} className={`alert-item alert-item-${flag.level}`}>
                  <span className="alert-dot" />
                  <span className="alert-message">
                    {flag.message}
                    {flag.href && (
                      <Link href={flag.href} className="alert-link">
                        View
                      </Link>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="card overview-actions-card">
          <div className="card-header">
            <h2 className="card-title">Quick actions</h2>
          </div>
          <div className="quick-action-list">
            <Link href="/admin?tab=approvals" className="quick-action-btn">
              <span className="quick-action-label">
                Review approvals
                {pendingCount > 0 && (
                  <span className="admin-tab-badge" style={{ marginLeft: 6 }}>
                    {pendingCount}
                  </span>
                )}
              </span>
              <span className="quick-action-arrow">→</span>
            </Link>
            <Link href="/admin?tab=people" className="quick-action-btn">
              <span className="quick-action-label">Adjust a balance</span>
              <span className="quick-action-arrow">→</span>
            </Link>
            <Link href="/admin?tab=reports" className="quick-action-btn">
              <span className="quick-action-label">Download report</span>
              <span className="quick-action-arrow">→</span>
            </Link>
            <Link href="/admin?tab=integrations" className="quick-action-btn">
              <span className="quick-action-label">BambooHR sync</span>
              <span className="quick-action-arrow">→</span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
