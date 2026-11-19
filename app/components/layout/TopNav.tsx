import Link from "next/link"
import { getActor } from "@/lib/tenant"
import { formatStars } from "@/lib/brand"
import NavLinks from "./NavLinks"
import NavWordmark from "./NavWordmark"
import UserDropdown from "./UserDropdown"
import SpotlightMark from "@/app/components/brand/SpotlightMark"

export default async function TopNav() {
  const actor = await getActor()

  const [me, company] = actor
    ? await Promise.all([
        actor.db.user.findUnique({
          where: { id: actor.userId },
          select: { fullName: true, givingBalance: true, balance: true, thumbnailUrl: true },
        }),
        actor.db.company.findUnique({
          where: { id: actor.companyId },
          select: { name: true, shortName: true, logoUrl: true },
        }),
      ])
    : [null, null]

  const showAdmin = actor?.isAdmin ?? false
  const showPlatform = actor?.isPlatformOwner ?? false
  const givingBalance = me?.givingBalance ?? 0
  const balance = me?.balance ?? 0
  const companyName = company?.name ?? ""
  // Under "Spotlight" (desktop and phones): the short name, never a truncated
  // full name. The full name is the tooltip.
  const companyShortName = company?.shortName || companyName

  return (
    <header className="tnav">
      <div className="tnav-inner">

        {/* ── Brand ──────────────────────────────────────────── */}
        <div className="tnav-brand">
          <Link href="/" prefetch={false} className="tnav-mark-link" aria-label="Home">
            {company?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt={companyName} className="tnav-mark" />
            ) : (
              <SpotlightMark />
            )}
          </Link>
          {/* Desktop: static wordmark */}
          <div className="tnav-wordmark">
            <div className="tnav-name">Spotlight</div>
            {companyName && <div className="tnav-parent" title={companyName}>{companyShortName}</div>}
          </div>
          {/* Mobile: scroll-aware crossfade island */}
          <NavWordmark givingBalance={givingBalance} balance={balance} companyName={companyShortName} companyFullName={companyName} />
        </div>

        {/* ── Desktop nav tabs ───────────────────────────────── */}
        <NavLinks showAdmin={showAdmin} />

        {/* ── Right: desktop balances + avatar ──────────────── */}
        <div className="tnav-right">
          <div className="tnav-desktop-bal" aria-label="Your stars">
            <span className="tnav-bal-num">{formatStars(givingBalance)}</span>
            <span className="tnav-bal-unit">to give</span>
            <span className="tnav-bal-dot">·</span>
            <span className="tnav-bal-num">{formatStars(balance)}</span>
            <span className="tnav-bal-unit">earned</span>
          </div>
          <UserDropdown
            name={me?.fullName ?? ""}
            thumbnailUrl={me?.thumbnailUrl ?? null}
            showAdmin={showAdmin}
            showPlatform={showPlatform}
          />
        </div>

      </div>
    </header>
  )
}
