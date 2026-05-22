import { auth } from "@/auth"
import { db } from "@/lib/db"
import AdminTabs from "@/app/components/admin/AdminTabs"
import { ADMIN_TABS, type AdminTabId } from "@/lib/adminTabsConfig"

const TAB_IDS = ADMIN_TABS.map((t) => t.id)

function isValidTab(tab: string): tab is AdminTabId {
  return (TAB_IDS as readonly string[]).includes(tab)
}

const PANEL_DESCRIPTIONS: Record<AdminTabId, { heading: string; description: string }> = {
  overview: {
    heading: "Overview",
    description: "Program health at a glance — kudos volume, drop balances, pending approvals, and recent activity.",
  },
  approvals: {
    heading: "Approvals",
    description: "Review pending incentive claims that require admin verification before drops are credited.",
  },
  rewards: {
    heading: "Rewards",
    description: "Manage the reward catalog — add, edit, and retire items. Set inventory limits and costs.",
  },
  incentives: {
    heading: "Incentives",
    description: "Manage the incentive catalog — create activities, set caps, configure time windows, and toggle active state.",
  },
  people: {
    heading: "People",
    description: "Staff roster, drop balances, giving history, and manual adjustments. Deactivate leavers.",
  },
  reports: {
    heading: "Reports",
    description: "Export kudo and redemption data. Cost attribution by entity for accounting purposes.",
  },
  integrations: {
    heading: "Integrations",
    description: "BambooHR sync status and manual trigger. Google Chat connection and channel configuration.",
  },
  program: {
    heading: "Program settings",
    description: "Monthly giving allowance per staff member. Company values. Recognition program name and branding.",
  },
  audit: {
    heading: "Audit log",
    description: "Immutable record of all admin actions — balance adjustments, reward changes, approval decisions.",
  },
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

  const panel = PANEL_DESCRIPTIONS[activeTab]

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

      <AdminTabs activeTab={activeTab} />

      <div className="admin-pane-shell">
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-header">
            <h2 className="card-title">{panel.heading}</h2>
          </div>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, padding: "0 0 4px" }}>
            {panel.description}
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", opacity: 0.6, marginTop: 16 }}>
            Coming soon.
          </p>
        </div>
      </div>
    </main>
  )
}
