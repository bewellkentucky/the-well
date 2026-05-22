import ExportCsvButton from "./ExportCsvButton"

export type LocationStat = {
  location: string
  redeemed: number
  userCount: number
}

export type HealthStats = {
  activeUserCount: number   // all accounts (no active filter — active may be null on older rows)
  uniqueGivers: number
  participationRate: number     // 0–1
  totalKudos: number
  avgKudosPerGiver: number
  totalDropsGiven: number
  allowanceUtilization: number  // 0–1, approximate
  totalEarned: number
  totalRedeemed: number
  redemptionRate: number        // 0–1
  usersWithLocation: number
}

export type CategoryStat = {
  category: string
  redeemed: number
}

function pct(ratio: number) {
  return `${Math.round(ratio * 100)}%`
}

function BarChart({
  rows,
  emptyMessage,
}: {
  rows: { label: string; sub?: string; value: number }[]
  emptyMessage: string
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  const hasData = rows.some((r) => r.value > 0)

  if (!hasData) {
    return (
      <p className="report-empty">{emptyMessage}</p>
    )
  }

  return (
    <div className="report-bar-chart">
      {rows.map((row) => (
        <div key={row.label} className="report-bar-row">
          <div className="report-bar-label-wrap">
            <span className="report-bar-label">{row.label}</span>
            {row.sub && <span className="report-bar-sub">{row.sub}</span>}
          </div>
          <div className="report-bar-track">
            <div
              className="report-bar-fill"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          <span className="report-bar-value">
            {row.value > 0 ? `${row.value.toLocaleString()}đ` : "—"}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ReportsPanel({
  locationStats,
  healthStats,
  categoryStats,
}: {
  locationStats: LocationStat[]
  healthStats: HealthStats
  categoryStats: CategoryStat[]
}) {
  const {
    activeUserCount,
    uniqueGivers,
    participationRate,
    totalKudos,
    avgKudosPerGiver,
    totalDropsGiven,
    allowanceUtilization,
    totalEarned,
    totalRedeemed,
    redemptionRate,
    usersWithLocation,
  } = healthStats

  const locationRows = locationStats.map((s) => ({
    label: s.location,
    sub:   `${s.userCount} staff`,
    value: s.redeemed,
  }))

  const categoryRows = categoryStats.map((s) => ({
    label: s.category,
    value: s.redeemed,
  }))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <ExportCsvButton
          locationStats={locationStats}
          healthStats={healthStats}
          categoryStats={categoryStats}
        />
      </div>

      {/* ── Card 1: Spend by location ──────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Spend by location</h2>
          <span className="report-period">Since launch</span>
        </div>
        <p className="people-explainer" style={{ marginBottom: 20 }}>
          Drops redeemed by staff at each location. Only accounts with a BambooHR location
          set are attributed — {usersWithLocation} of {activeUserCount}
          {activeUserCount === 1 ? " account has" : " accounts have"} a location synced.
        </p>
        {locationStats.length === 0 ? (
          <p className="report-empty">No location data yet. Run BambooHR sync to populate.</p>
        ) : (
          <BarChart
            rows={locationRows}
            emptyMessage="No redemptions recorded yet."
          />
        )}
      </div>

      {/* ── Card 2: Program health ─────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Program health</h2>
          <span className="report-period">Since launch</span>
        </div>

        <div className="health-grid">
          <div className="health-stat">
            <div className="health-stat-value">{pct(participationRate)}</div>
            <div className="health-stat-label">Participation rate</div>
            <div className="health-stat-note">
              {uniqueGivers} of {activeUserCount} accounts gave a kudo
            </div>
          </div>

          <div className="health-stat">
            <div className="health-stat-value">{totalKudos.toLocaleString()}</div>
            <div className="health-stat-label">Kudos sent</div>
            <div className="health-stat-note">total since launch</div>
          </div>

          <div className="health-stat">
            <div className="health-stat-value">
              {uniqueGivers > 0 ? avgKudosPerGiver.toFixed(1) : "—"}
            </div>
            <div className="health-stat-label">Avg per giver</div>
            <div className="health-stat-note">kudos per active giver</div>
          </div>

          <div className="health-stat">
            <div className="health-stat-value">{pct(allowanceUtilization)}</div>
            <div className="health-stat-label">Allowance utilization</div>
            <div className="health-stat-note">
              {totalDropsGiven.toLocaleString()}đ given of {(activeUserCount * 100).toLocaleString()}đ total capacity*
            </div>
          </div>

          <div className="health-stat">
            <div className="health-stat-value">{totalEarned.toLocaleString()}đ</div>
            <div className="health-stat-label">Total earned</div>
            <div className="health-stat-note">earned drops across all staff</div>
          </div>

          <div className="health-stat">
            <div className="health-stat-value">{pct(redemptionRate)}</div>
            <div className="health-stat-label">Redemption rate</div>
            <div className="health-stat-note">
              {totalRedeemed.toLocaleString()}đ of {totalEarned.toLocaleString()}đ earned spent
            </div>
          </div>
        </div>

        <p className="report-footnote">
          * Utilization denominator assumes 100đ default allowance per active account
          and no resets (reset cadence not yet configured).
        </p>
      </div>

      {/* ── Card 3: Redemptions by category ───────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Redemptions by category</h2>
          <span className="report-period">Since launch</span>
        </div>
        <p className="people-explainer" style={{ marginBottom: 20 }}>
          Drops spent on each reward type. Fulfillment costs in dollars are deferred
          until the admin approval queue triggers external APIs.
        </p>
        {categoryStats.length === 0 ? (
          <p className="report-empty">No redemptions recorded yet.</p>
        ) : (
          <BarChart
            rows={categoryRows}
            emptyMessage="No redemptions recorded yet."
          />
        )}
      </div>

    </div>
  )
}
