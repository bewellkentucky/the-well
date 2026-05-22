import Image from "next/image"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import NavLinks from "./NavLinks"
import UserDropdown from "./UserDropdown"

export default async function TopNav() {
  const session = await auth()

  const dbUser = session?.user?.id
    ? await db.user.findUnique({
        where:  { id: session.user.id },
        select: { role: true, fullName: true },
      })
    : null

  const showAdmin    = dbUser?.role === "owner" || dbUser?.role === "admin"
  const displayName  = dbUser?.fullName ?? session?.user?.name ?? ""
  const email        = session?.user?.email ?? ""
  const thumbnailUrl = session?.user?.image ?? null

  return (
    <header className="tnav">
      <div className="tnav-inner">

        {/* ── Brand ──────────────────────────────────────────── */}
        <div className="tnav-brand">
          <div className="tnav-mark">
            <Image
              src="/Be_Well_Icon_Color.png"
              alt="Be Well Kentucky"
              width={44}
              height={44}
              style={{ display: "block" }}
              priority
            />
          </div>
          <div className="tnav-wordmark">
            <div className="tnav-name">The Well</div>
            <div className="tnav-parent">by Be Well Kentucky</div>
          </div>
        </div>

        {/* ── Desktop nav tabs ───────────────────────────────── */}
        <NavLinks showAdmin={showAdmin} />

        {/* ── User avatar → dropdown ─────────────────────────── */}
        <UserDropdown
          name={displayName}
          email={email}
          thumbnailUrl={thumbnailUrl}
        />

      </div>
    </header>
  )
}
