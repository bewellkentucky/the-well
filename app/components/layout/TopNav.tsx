import Image from "next/image"
import { auth, signOut } from "@/auth"
import { db } from "@/lib/db"
import NavLinks from "./NavLinks"
import Avatar from "@/app/components/ui/Avatar"

export default async function TopNav() {
  const session = await auth()

  const dbUser = session?.user?.id
    ? await db.user.findUnique({
        where:  { id: session.user.id },
        select: { role: true, fullName: true },
      })
    : null

  const showAdmin = dbUser?.role === "owner" || dbUser?.role === "admin"
  const displayName = dbUser?.fullName ?? session?.user?.name ?? ""
  const firstName = displayName.split(" ")[0]

  return (
    <header className="tnav">
      <div className="tnav-inner">

        {/* ── Brand ──────────────────────────────────────────── */}
        <div className="tnav-brand">
          <div className="tnav-mark">
            <Image
              src="/brand-icon.png"
              alt="Be Well Kentucky"
              width={30}
              height={30}
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

        {/* ── User chip ──────────────────────────────────────── */}
        <div className="tnav-user">
          <Avatar
            name={displayName}
            email={session?.user?.email ?? ""}
            thumbnailUrl={session?.user?.image ?? null}
            size="sm"
          />
          <span className="tnav-user-name">{firstName}</span>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/" })
            }}
          >
            <button type="submit" className="tnav-signout">
              Sign out
            </button>
          </form>
        </div>

      </div>
    </header>
  )
}
