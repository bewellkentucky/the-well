import { auth } from "@/auth"
import { db } from "@/lib/db"
import AdminTabs from "@/app/components/admin/AdminTabs"
import ApprovalsPanel, {
  type ApprovalClaim,
  type ApprovalRedemption,
  type DecidedClaim,
} from "@/app/components/admin/ApprovalsPanel"
import PeoplePanel, {
  type PersonRow,
  type RecentAdjustment,
} from "@/app/components/admin/PeoplePanel"
import ReportsPanel, {
  type LocationStat,
  type HealthStats,
  type CategoryStat,
} from "@/app/components/admin/ReportsPanel"
import OverviewPanel, {
  type OverviewData,
} from "@/app/components/admin/OverviewPanel"
import AuditPanel, {
  type AuditLogEntry,
} from "@/app/components/admin/AuditPanel"
import IncentivesPanel, {
  type IncentiveAdminRow,
  type ClaimHistoryRow,
} from "@/app/components/admin/IncentivesPanel"
import { ADMIN_TABS, type AdminTabId } from "@/lib/adminTabsConfig"

const TAB_IDS = ADMIN_TABS.map((t) => t.id)

function isValidTab(tab: string): tab is AdminTabId {
  return (TAB_IDS as readonly string[]).includes(tab)
}

const PLACEHOLDER: Record<AdminTabId, { heading: string; description: string }> = {
  overview:     { heading: "Overview",          description: "Program health at a glance — kudos volume, drop balances, pending approvals, and recent activity." },
  approvals:    { heading: "Approvals",         description: "" },
  rewards:      { heading: "Rewards",           description: "Manage the reward catalog — add, edit, and retire items. Set inventory limits and costs." },
  incentives:   { heading: "Incentives",        description: "Manage the incentive catalog — create activities, set caps, configure time windows, and toggle active state." },
  people:       { heading: "People",            description: "Staff roster, drop balances, giving history, and manual adjustments. Deactivate leavers." },
  reports:      { heading: "Reports",           description: "Export kudo and redemption data. Cost attribution by entity for accounting purposes." },
  integrations: { heading: "Integrations",      description: "BambooHR sync status and manual trigger. Google Chat connection and channel configuration." },
  program:      { heading: "Program settings",  description: "Monthly giving allowance per staff member. Company values. Recognition program name and branding." },
  audit:        { heading: "Audit log",         description: "Immutable record of all admin actions — balance adjustments, reward changes, approval decisions." },
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  const rawTab = params.tab ?? "overview"
  const activeTab: AdminTabId = isValidTab(rawTab) ? rawTab : "overview"

  const session = await auth()
  const user = await db.user.findUnique({
    where: { id: session!.user!.id! },
    select: { fullName: true, role: true },
  })

  // Always fetch pending count so the Approvals tab badge stays current
  const pendingCount = await db.$transaction([
    db.incentiveClaim.count({ where: { status: "pending", incentive: { verification: "admin" } } }),
    db.redemption.count({ where: { status: "pending" } }),
  ]).then(([claims, redemptions]) => claims + redemptions)

  // ── People tab data ────────────────────────────────────────
  let people: PersonRow[] = []
  let recentAdjustments: RecentAdjustment[] = []

  if (activeTab === "people") {
    const rolePriority: Record<string, number> = { owner: 0, admin: 1, member: 2 }

    const [rawPeople, rawAdj] = await Promise.all([
      db.user.findMany({
        select: {
          id: true,
          fullName: true,
          email: true,
          thumbnailUrl: true,
          role: true,
          balance: true,
          givingBalance: true,
          employmentStatus: true,
        },
        orderBy: { fullName: "asc" },
      }),
      db.auditLog.findMany({
        where:   { action: "adjust_balance" },
        orderBy: { createdAt: "desc" },
        take:    10,
      }),
    ])

    people = rawPeople.sort((a, b) => {
      const rp = (rolePriority[a.role] ?? 3) - (rolePriority[b.role] ?? 3)
      return rp !== 0 ? rp : a.fullName.localeCompare(b.fullName)
    })

    recentAdjustments = rawAdj.map((a) => ({
      id:        a.id,
      userName:  a.targetName ?? "Unknown",
      actorName: a.actorName,
      amount:    a.amount ?? 0,
      reason:    a.reason ?? "",
      createdAt: a.createdAt.toISOString(),
    }))
  }

  // ── Reports tab data ───────────────────────────────────────
  let locationStats: LocationStat[] = []
  let healthStats: HealthStats = {
    activeUserCount: 0, uniqueGivers: 0, participationRate: 0,
    totalKudos: 0, avgKudosPerGiver: 0, totalDropsGiven: 0,
    allowanceUtilization: 0, totalEarned: 0, totalRedeemed: 0,
    redemptionRate: 0, usersWithLocation: 0,
  }
  let categoryStats: CategoryStat[] = []

  if (activeTab === "reports") {
    const [rawUsers, rawKudos, rawRedemptions] = await Promise.all([
      db.user.findMany({
        select: { id: true, location: true, balance: true },
      }),
      db.kudo.findMany({ select: { fromId: true, amount: true } }),
      db.redemption.findMany({
        where: { status: { not: "declined" } },
        select: {
          cost: true,
          user:   { select: { location: true } },
          reward: { select: { category: true } },
        },
      }),
    ])

    // ── Location stats ─────────────────────────────────────
    const locMap = new Map<string, { redeemed: number; userCount: number }>()
    for (const u of rawUsers) {
      const loc = u.location ?? "No location set"
      const e = locMap.get(loc) ?? { redeemed: 0, userCount: 0 }
      e.userCount++
      locMap.set(loc, e)
    }
    for (const r of rawRedemptions) {
      const loc = r.user.location ?? "No location set"
      const e = locMap.get(loc) ?? { redeemed: 0, userCount: 0 }
      e.redeemed += r.cost
      locMap.set(loc, e)
    }
    locationStats = Array.from(locMap.entries())
      .map(([location, s]) => ({ location, ...s }))
      .sort((a, b) => b.redeemed - a.redeemed || b.userCount - a.userCount)

    // ── Health stats ───────────────────────────────────────
    const activeUserCount  = rawUsers.length
    const uniqueGiverSet   = new Set(rawKudos.map((k) => k.fromId))
    const uniqueGivers     = uniqueGiverSet.size
    const totalKudos       = rawKudos.length
    const totalDropsGiven  = rawKudos.reduce((s, k) => s + k.amount, 0)
    const totalRedeemed    = rawRedemptions.reduce((s, r) => s + r.cost, 0)
    const currentBalances  = rawUsers.reduce((s, u) => s + u.balance, 0)
    const totalEarned      = currentBalances + totalRedeemed

    healthStats = {
      activeUserCount,
      uniqueGivers,
      participationRate:    activeUserCount > 0 ? uniqueGivers / activeUserCount : 0,
      totalKudos,
      avgKudosPerGiver:     uniqueGivers > 0 ? totalKudos / uniqueGivers : 0,
      totalDropsGiven,
      allowanceUtilization: activeUserCount > 0 ? totalDropsGiven / (activeUserCount * 100) : 0,
      totalEarned,
      totalRedeemed,
      redemptionRate:       totalEarned > 0 ? totalRedeemed / totalEarned : 0,
      usersWithLocation:    rawUsers.filter((u) => u.location !== null).length,
    }

    // ── Category stats ─────────────────────────────────────
    const catMap = new Map<string, number>()
    for (const r of rawRedemptions) {
      catMap.set(r.reward.category, (catMap.get(r.reward.category) ?? 0) + r.cost)
    }
    categoryStats = Array.from(catMap.entries())
      .map(([category, redeemed]) => ({ category, redeemed }))
      .sort((a, b) => b.redeemed - a.redeemed)
  }

  // ── Approvals tab data ──────────────────────────────────────
  let pendingClaims: ApprovalClaim[] = []
  let pendingRedemptions: ApprovalRedemption[] = []
  let recentDecisions: DecidedClaim[] = []

  if (activeTab === "approvals") {
    const [rawClaims, rawRedemptions, rawDecided] = await Promise.all([
      db.incentiveClaim.findMany({
        where: { status: "pending", incentive: { verification: "admin" } },
        include: {
          user:      { select: { fullName: true, email: true, thumbnailUrl: true } },
          incentive: { select: { title: true, reward: true, icon: true, color: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.redemption.findMany({
        where: { status: "pending" },
        include: {
          user:   { select: { fullName: true, email: true, thumbnailUrl: true } },
          reward: { select: { title: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.incentiveClaim.findMany({
        where: {
          status:    { in: ["credited", "declined"] },
          incentive: { verification: "admin" },
          decidedAt: { not: null },
        },
        include: {
          user:      { select: { fullName: true, email: true, thumbnailUrl: true } },
          incentive: { select: { title: true, reward: true } },
        },
        orderBy: { decidedAt: "desc" },
        take: 10,
      }),
    ])

    // Serialize dates to strings for client component boundary
    pendingClaims = rawClaims.map((c) => ({
      id:        c.id,
      user:      c.user,
      incentive: c.incentive,
      note:      c.note,
      proofLink: c.proofLink,
      createdAt: c.createdAt.toISOString(),
    }))

    pendingRedemptions = rawRedemptions.map((r) => ({
      id:        r.id,
      user:      r.user,
      reward:    r.reward,
      cost:      r.cost,
      notes:     r.notes,
      createdAt: r.createdAt.toISOString(),
    }))

    recentDecisions = rawDecided.map((d) => ({
      id:        d.id,
      user:      d.user,
      incentive: d.incentive,
      status:    d.status,
      decidedAt: d.decidedAt?.toISOString() ?? null,
    }))
  }

  // ── Incentives tab data ────────────────────────────────────
  let incentives: IncentiveAdminRow[] = []
  let claimHistory: ClaimHistoryRow[] = []

  if (activeTab === "incentives") {
    const [rawIncentives, rawClaims] = await Promise.all([
      db.incentive.findMany({
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
        include: { _count: { select: { claims: true } } },
      }),
      db.incentiveClaim.findMany({
        include: {
          user:      { select: { fullName: true, email: true, thumbnailUrl: true } },
          incentive: { select: { title: true, icon: true, color: true, reward: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ])

    incentives = rawIncentives.map((i) => ({
      id:           i.id,
      title:        i.title,
      description:  i.description,
      reward:       i.reward,
      verification: i.verification,
      cap:          i.cap,
      icon:         i.icon,
      color:        i.color,
      proofPrompt:  i.proofPrompt,
      active:       i.active,
      sortOrder:    i.sortOrder,
      startsAt:     i.startsAt?.toISOString() ?? null,
      endsAt:       i.endsAt?.toISOString()   ?? null,
      claimCount:   i._count.claims,
    }))

    claimHistory = rawClaims.map((c) => ({
      id:              c.id,
      createdAt:       c.createdAt.toISOString(),
      userName:        c.user.fullName,
      userEmail:       c.user.email,
      userThumbnail:   c.user.thumbnailUrl,
      incentiveTitle:  c.incentive.title,
      incentiveIcon:   c.incentive.icon,
      incentiveColor:  c.incentive.color,
      status:          c.status,
      decidedById:     c.decidedById,
      rewardSnapshot:  c.rewardSnapshot,
      incentiveReward: c.incentive.reward,
    }))
  }

  // ── Audit tab data ─────────────────────────────────────────
  let auditLogs: AuditLogEntry[] = []

  if (activeTab === "audit") {
    const rows = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take:    100,
    })
    auditLogs = rows.map((r) => ({
      id:         r.id,
      createdAt:  r.createdAt.toISOString(),
      actorName:  r.actorName,
      targetName: r.targetName,
      action:     r.action,
      details:    r.details,
      amount:     r.amount,
      reason:     r.reason,
    }))
  }

  // ── Overview tab data ──────────────────────────────────────
  let overviewData: OverviewData = {
    totalUsers:        0,
    earnedOutstanding: 0,
    participationRate: 0,
    totalKudos:        0,
    uniqueGivers:      0,
    noKudosCount:      0,
    pendingCount,
    lastSync:          null,
    recentHireCount:   0,
  }

  if (activeTab === "overview") {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [rawUsers, rawKudos, lastSyncRow] = await Promise.all([
      db.user.findMany({ select: { id: true, balance: true, hireDate: true } }),
      db.kudo.findMany({ select: { fromId: true } }),
      db.integrationSync.findFirst({
        where:   { source: "bamboohr" },
        orderBy: { lastRunAt: "desc" },
      }),
    ])

    const totalUsers       = rawUsers.length
    const earnedOutstanding = rawUsers.reduce((s, u) => s + u.balance, 0)
    const giverSet          = new Set(rawKudos.map((k) => k.fromId))
    const uniqueGivers      = giverSet.size
    const noKudosCount      = rawUsers.filter((u) => !giverSet.has(u.id)).length
    const recentHireCount   = rawUsers.filter(
      (u) => u.hireDate !== null && u.hireDate >= thirtyDaysAgo
    ).length

    overviewData = {
      totalUsers,
      earnedOutstanding,
      participationRate: totalUsers > 0 ? uniqueGivers / totalUsers : 0,
      totalKudos:        rawKudos.length,
      uniqueGivers,
      noKudosCount,
      pendingCount,
      lastSync: lastSyncRow
        ? {
            lastRunAt:        lastSyncRow.lastRunAt.toISOString(),
            errors:           lastSyncRow.errors,
            recordsProcessed: lastSyncRow.recordsProcessed,
          }
        : null,
      recentHireCount,
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
      <div className="dir-topbar" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-subtitle">
            Signed in as <strong>{user?.fullName}</strong> ({user?.role}). Changes apply to the whole program.
          </p>
        </div>
      </div>

      <AdminTabs activeTab={activeTab} pendingCount={pendingCount} />

      <div className="admin-pane-shell">
        {activeTab === "overview" ? (
          <OverviewPanel data={overviewData} />
        ) : activeTab === "approvals" ? (
          <ApprovalsPanel
            pendingClaims={pendingClaims}
            pendingRedemptions={pendingRedemptions}
            recentDecisions={recentDecisions}
          />
        ) : activeTab === "people" ? (
          <PeoplePanel
            people={people}
            actorId={session!.user!.id!}
            actorRole={user?.role ?? "member"}
            recentAdjustments={recentAdjustments}
          />
        ) : activeTab === "reports" ? (
          <ReportsPanel
            locationStats={locationStats}
            healthStats={healthStats}
            categoryStats={categoryStats}
          />
        ) : activeTab === "incentives" ? (
          <IncentivesPanel
            incentives={incentives}
            claimHistory={claimHistory}
          />
        ) : activeTab === "audit" ? (
          <AuditPanel logs={auditLogs} />
        ) : (
          <div className="card" style={{ maxWidth: 560 }}>
            <div className="card-header">
              <h2 className="card-title">{PLACEHOLDER[activeTab].heading}</h2>
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, padding: "0 0 4px" }}>
              {PLACEHOLDER[activeTab].description}
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", opacity: 0.6, marginTop: 16 }}>
              Coming soon.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
