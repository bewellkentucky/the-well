import Link from "next/link"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import NavLinks from "./NavLinks"
import NavWordmark from "./NavWordmark"
import UserDropdown from "./UserDropdown"

export default async function TopNav() {
  const session = await auth()

  const dbUser = session?.user?.id
    ? await db.user.findUnique({
        where:  { id: session.user.id },
        select: { role: true, fullName: true, givingBalance: true, balance: true },
      })
    : null

  const showAdmin     = dbUser?.role === "owner" || dbUser?.role === "admin"
  const displayName   = dbUser?.fullName ?? session?.user?.name ?? ""
  const thumbnailUrl  = session?.user?.image ?? null
  const givingBalance = dbUser?.givingBalance ?? 0
  const balance       = dbUser?.balance ?? 0

  return (
    <header className="tnav">
      <div className="tnav-inner">

        {/* ── Brand ──────────────────────────────────────────── */}
        <div className="tnav-brand">
          <Link href="/" prefetch={false} className="tnav-mark-link">
            <div className="tnav-mark" role="img" aria-label="Be Well Kentucky" />
          </Link>
          {/* Desktop: static wordmark */}
          <div className="tnav-wordmark">
            <div className="tnav-name">The Well</div>
            <div className="tnav-parent">by Be Well Kentucky</div>
          </div>
          {/* Mobile: scroll-aware crossfade island */}
          <NavWordmark givingBalance={givingBalance} balance={balance} />
        </div>

        {/* ── Desktop nav tabs ───────────────────────────────── */}
        <NavLinks showAdmin={showAdmin} />

        {/* ── Right: desktop balances + avatar ──────────────── */}
        <div className="tnav-right">
          <div className="tnav-desktop-bal">
            <span className="tnav-bal-num">{givingBalance}</span>
            <span className="tnav-bal-unit">đ give</span>
            <span className="tnav-bal-dot">·</span>
            <span className="tnav-bal-num">{balance}</span>
            <span className="tnav-bal-unit">đ earned</span>
          </div>
          <UserDropdown name={displayName} thumbnailUrl={thumbnailUrl} />
        </div>

      </div>
    </header>
  )
}
