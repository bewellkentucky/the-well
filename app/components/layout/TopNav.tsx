import Image from "next/image"
import { auth, signOut } from "@/auth"

export default async function TopNav() {
  const session = await auth()
  const name = session?.user?.name ?? ""
  const initials = name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <header
      style={{ background: "var(--ink)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      className="sticky top-0 z-50"
    >
      <div
        className="mx-auto flex items-center justify-between"
        style={{ maxWidth: 1100, padding: "0 24px", height: 56 }}
      >
        {/* Logo + wordmark */}
        <div className="flex items-center gap-3">
          <Image
            src="/brand-icon.png"
            alt="The Well"
            width={28}
            height={28}
            className="rounded"
          />
          <span
            style={{ fontFamily: "var(--font-lora), serif", fontSize: 18, color: "var(--cream)", fontWeight: 600 }}
          >
            The Well
          </span>
        </div>

        {/* User + sign out */}
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 13, color: "rgba(244,241,236,0.7)" }}>{name}</span>
          <div className="avatar sm" style={{ flexShrink: 0 }}>
            {initials}
          </div>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/" })
            }}
          >
            <button
              type="submit"
              style={{
                fontSize: 12,
                color: "rgba(244,241,236,0.5)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
