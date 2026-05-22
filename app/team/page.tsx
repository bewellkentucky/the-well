import { auth } from "@/auth"
import { redirect } from "next/navigation"
import PageShell from "@/app/components/layout/PageShell"

export default async function TeamPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/")

  return (
    <PageShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
        <div className="card" style={{ maxWidth: 560 }}>
          <h1 style={{ fontFamily: "var(--font-lora), serif", fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
            Team directory
          </h1>
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
            The full team roster, with roles and contact info, is coming here.
          </p>
        </div>
      </main>
    </PageShell>
  )
}
