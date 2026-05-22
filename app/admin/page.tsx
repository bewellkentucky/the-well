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
      db.balanceAdjustment.findMany({
        include: {
          user:  { select: { fullName: true } },
          actor: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ])

    people = rawPeople.sort((a, b) => {
      const rp = (rolePriority[a.role] ?? 3) - (rolePriority[b.role] ?? 3)
      return rp !== 0 ? rp : a.fullName.localeCompare(b.fullName)
    })

    recentAdjustments = rawAdj.map((a) => ({
      id:        a.id,
      userName:  a.user.fullName,
      actorName: a.actor.fullName,
      amount:    a.amount,
      reason:    a.reason,
      createdAt: a.createdAt.toISOString(),
    }))
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
        {activeTab === "approvals" ? (
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
