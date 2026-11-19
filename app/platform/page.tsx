import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getActor } from "@/lib/tenant"
import { bambooKeyEnvName } from "@/lib/syncBambooHR"
import { normalizeTheme, type Theme } from "@/lib/theme"

function normalizeStoredTheme(stored: unknown): Theme | null {
  try {
    return normalizeTheme(stored)
  } catch {
    return null
  }
}
import PageShell from "@/app/components/layout/PageShell"
import CompanyEditor, { type CompanyRow } from "@/app/components/platform/CompanyEditor"

// Platform owner only: every company in Spotlight. Uses the unscoped client on
// purpose; nothing here is reachable without isPlatformOwner (re-read from DB).
export default async function PlatformPage() {
  const actor = await getActor()
  if (!actor?.isPlatformOwner) redirect("/")

  const companies = await db.company.findMany({
    orderBy: { name: "asc" },
    include: {
      domains: { select: { domain: true }, orderBy: { domain: "asc" } },
      users: {
        where: { active: true },
        select: { id: true, fullName: true, email: true, role: true, isPlatformOwner: true },
        orderBy: [{ role: "asc" }, { fullName: "asc" }],
      },
      _count: { select: { kudos: true } },
    },
  })

  const rows: CompanyRow[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    slug: c.slug,
    domains: c.domains.map((d) => d.domain),
    appUrl: c.appUrl,
    logoUrl: c.logoUrl,
    theme: normalizeStoredTheme(c.theme),
    bambooEnabled: c.bambooEnabled,
    bambooSubdomain: c.bambooSubdomain,
    bambooKeyEnv: bambooKeyEnvName(c.slug),
    bambooKeyPresent: !!process.env[bambooKeyEnvName(c.slug)],
    chatSpace: c.chatSpace,
    active: c.active,
    kudoCount: c._count.kudos,
    people: c.users,
  }))

  return (
    <PageShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
        <div className="dir-topbar" style={{ marginBottom: 24 }}>
          <div>
            <h1 className="page-title">Platform</h1>
            <p className="page-subtitle">
              Every company on Spotlight. Only platform owners see this page.
            </p>
          </div>
        </div>
        <CompanyEditor companies={rows} currentCompanyId={actor.companyId} />
      </main>
    </PageShell>
  )
}
