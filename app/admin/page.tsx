import { requireAdmin } from "@/lib/tenant"
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
import RewardsPanel, {
  type RewardAdminRow,
} from "@/app/components/admin/RewardsPanel"
import IntegrationsPanel, {
  type BambooSyncStatus,
} from "@/app/components/admin/IntegrationsPanel"
import ProgramPanel from "@/app/components/admin/ProgramPanel"
import { ADMIN_TABS, type AdminTabId } from "@/lib/adminTabsConfig"
import { INCENTIVE_ORDER, isInWindow } from "@/lib/incentives"

const TAB_IDS = ADMIN_TABS.map((t) => t.id)

function isValidTab(tab: string): tab is AdminTabId {
  return (TAB_IDS as readonly string[]).includes(tab)
}


export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  const rawTab = params.tab ?? "overview"
  const activeTab: AdminTabId = isValidTab(rawTab) ? rawTab : "overview"

  const actor = await requireAdmin()
  const sdb = actor.db
  const company = await sdb.company.findUnique({
    where: { id: actor.companyId },
    select: {
      name: true, allowanceAmount: true, featuredIncentiveCount: true, logoUrl: true, brandColor: true,
      bambooEnabled: true, bambooSubdomain: true, slug: true,
    },
  })
  const allowance = company?.allowanceAmount ?? 100

  // Always fetch pending count so the Approvals tab badge stays current
  const pendingCount = await Promise.all([
    sdb.incentiveClaim.count({ where: { status: "pending", incentive: { verification: "admin" } } }),
    sdb.redemption.count({ where: { status: "pending" } }),
  ]).then(([claims, redemptions]) => claims + redemptions)

  // ── People tab data ────────────────────────────────────────
  let people: PersonRow[] = []
  let recentAdjustments: RecentAdjustment[] = []

  if (activeTab === "people") {
    const rolePriority: Record<string, number> = { admin: 0, member: 1 }

    const [rawPeople, rawAdj] = await Promise.all([
      sdb.user.findMany({
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
      sdb.auditLog.findMany({
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
      sdb.user.findMany({
        select: { id: true, location: true, balance: true },
      }),
      sdb.kudo.findMany({ select: { fromId: true, amount: true } }),
      sdb.redemption.findMany({
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
      allowanceUtilization: activeUserCount > 0 && allowance > 0 ? totalDropsGiven / (activeUserCount * allowance) : 0,
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
      sdb.incentiveClaim.findMany({
        where: { status: "pending", incentive: { verification: "admin" } },
        include: {
          user:      { select: { fullName: true, email: true, thumbnailUrl: true } },
          incentive: { select: { title: true, reward: true, icon: true, color: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      sdb.redemption.findMany({
        where: { status: "pending" },
        include: {
          user:   { select: { fullName: true, email: true, thumbnailUrl: true } },
          reward: { select: { title: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      sdb.incentiveClaim.findMany({
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

  // ── Rewards tab data ───────────────────────────────────────
  let rewards: RewardAdminRow[] = []

  if (activeTab === "rewards") {
    const rawRewards = await sdb.reward.findMany({
      orderBy: [{ active: "desc" }, { title: "asc" }],
      include: { _count: { select: { redemptions: true } } },
    })

    rewards = rawRewards.map((r) => ({
      id:              r.id,
      title:           r.title,
      description:     r.description,
      cost:            r.cost,
      category:        r.category,
      inventory:       r.inventory,
      icon:            r.icon,
      color:           r.color,
      active:          r.active,
      redemptionCount: r._count.redemptions,
    }))
  }

  // ── Incentives tab data ────────────────────────────────────
  let incentives: IncentiveAdminRow[] = []
  let claimHistory: ClaimHistoryRow[] = []
  let featuredIds: string[] = []

  if (activeTab === "incentives") {
    const [rawIncentives, rawClaims] = await Promise.all([
      sdb.incentive.findMany({
        orderBy: INCENTIVE_ORDER,
        include: { _count: { select: { claims: true } } },
      }),
      sdb.incentiveClaim.findMany({
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

    const now = new Date()
    featuredIds = rawIncentives
      .filter((i) => i.active && isInWindow(i, now))
      .slice(0, company?.featuredIncentiveCount ?? 2)
      .map((i) => i.id)

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

  // ── Integrations tab data ──────────────────────────────────
  let bambooLastSync: BambooSyncStatus | null = null
  let workspaceUserCount = 0
  let domains: string[] = []

  if (activeTab === "integrations") {
    const [lastSync, userCount, domainRows] = await Promise.all([
      sdb.integrationSync.findFirst({
        where:   { source: "bamboohr" },
        orderBy: { lastRunAt: "desc" },
      }),
      sdb.user.count(),
      sdb.companyDomain.findMany({ where: { companyId: actor.companyId }, select: { domain: true }, orderBy: { domain: "asc" } }),
    ])
    domains = domainRows.map((d) => d.domain)
    bambooLastSync = lastSync
      ? {
          id:               lastSync.id,
          lastRunAt:        lastSync.lastRunAt.toISOString(),
          recordsProcessed: lastSync.recordsProcessed,
          errors:           lastSync.errors,
          notes:            lastSync.notes,
        }
      : null
    workspaceUserCount = userCount
  }

  // ── Audit tab data ─────────────────────────────────────────
  let auditLogs: AuditLogEntry[] = []

  if (activeTab === "audit") {
    const rows = await sdb.auditLog.findMany({
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

  // ── Program tab data ───────────────────────────────────────

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
    bambooConnected:   !!(company?.bambooEnabled && company?.bambooSubdomain),
  }

  if (activeTab === "overview") {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [rawUsers, rawKudos, lastSyncRow] = await Promise.all([
      sdb.user.findMany({ select: { id: true, balance: true, hireDate: true } }),
      sdb.kudo.findMany({ select: { fromId: true } }),
      sdb.integrationSync.findFirst({
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
      bambooConnected: !!(company?.bambooEnabled && company?.bambooSubdomain),
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
      <div className="dir-topbar" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-subtitle">
            Signed in as <strong>{actor.fullName}</strong>{actor.isPlatformOwner ? " (platform owner)" : " (admin)"}. Changes apply to {company?.name ?? "your company"} only.
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
            actorId={actor.userId}
            canChangeRoles={actor.isPlatformOwner}
            recentAdjustments={recentAdjustments}
          />
        ) : activeTab === "reports" ? (
          <ReportsPanel
            locationStats={locationStats}
            healthStats={healthStats}
            categoryStats={categoryStats}
          />
        ) : activeTab === "rewards" ? (
          <RewardsPanel rewards={rewards} />
        ) : activeTab === "integrations" ? (
          <IntegrationsPanel
            bambooLastSync={bambooLastSync}
            userCount={workspaceUserCount}
            bambooConnected={!!(company?.bambooEnabled && company?.bambooSubdomain)}
            domains={domains}
          />
        ) : activeTab === "incentives" ? (
          <IncentivesPanel
            incentives={incentives}
            claimHistory={claimHistory}
            featuredIds={featuredIds}
            featuredCount={company?.featuredIncentiveCount ?? 2}
          />
        ) : activeTab === "audit" ? (
          <AuditPanel logs={auditLogs} />
        ) : activeTab === "program" ? (
          <ProgramPanel
            allowanceAmount={allowance}
            featuredCount={company?.featuredIncentiveCount ?? 2}
            logoUrl={company?.logoUrl ?? null}
            brandColor={company?.brandColor ?? null}
          />
        ) : null}

      </div>
    </main>
  )
}
