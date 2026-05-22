"use client"

import type { LocationStat, HealthStats, CategoryStat } from "./ReportsPanel"

function pct(ratio: number) {
  return `${Math.round(ratio * 100)}%`
}

function buildCsv(
  locationStats: LocationStat[],
  healthStats: HealthStats,
  categoryStats: CategoryStat[],
): string {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  })

  const lines: string[] = []

  lines.push("The Well — Program Report")
  lines.push("Period: Since launch")
  lines.push(`Generated: ${date}`)
  lines.push("")

  lines.push("SPEND BY LOCATION")
  lines.push("Location,Staff,Drops Redeemed (đ)")
  for (const s of locationStats) {
    lines.push(`"${s.location}",${s.userCount},${s.redeemed}`)
  }
  lines.push("")

  lines.push("PROGRAM HEALTH")
  lines.push("Metric,Value")
  lines.push(`Participation rate,${pct(healthStats.participationRate)}`)
  lines.push(`Kudos sent,${healthStats.totalKudos}`)
  lines.push(`Avg kudos per giver,${healthStats.uniqueGivers > 0 ? healthStats.avgKudosPerGiver.toFixed(1) : "0"}`)
  lines.push(`Allowance utilization (approx),${pct(healthStats.allowanceUtilization)}`)
  lines.push(`Total drops given (đ),${healthStats.totalDropsGiven}`)
  lines.push(`Total drops earned (đ),${healthStats.totalEarned}`)
  lines.push(`Total drops redeemed (đ),${healthStats.totalRedeemed}`)
  lines.push(`Redemption rate,${pct(healthStats.redemptionRate)}`)
  lines.push(`Accounts,${healthStats.activeUserCount}`)
  lines.push(`Accounts with location synced,${healthStats.usersWithLocation}`)
  lines.push("")

  lines.push("REDEMPTIONS BY CATEGORY")
  lines.push("Category,Drops Redeemed (đ)")
  if (categoryStats.length === 0) {
    lines.push("No redemptions recorded,0")
  } else {
    for (const s of categoryStats) {
      lines.push(`"${s.category}",${s.redeemed}`)
    }
  }

  // BOM ensures Excel opens UTF-8 correctly (đ renders without mojibake)
  return "﻿" + lines.join("\n")
}

export default function ExportCsvButton({
  locationStats,
  healthStats,
  categoryStats,
}: {
  locationStats: LocationStat[]
  healthStats: HealthStats
  categoryStats: CategoryStat[]
}) {
  function handleExport() {
    const csv = buildCsv(locationStats, healthStats, categoryStats)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `the-well-report-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button className="btn btn-export" onClick={handleExport}>
      Export CSV
    </button>
  )
}
