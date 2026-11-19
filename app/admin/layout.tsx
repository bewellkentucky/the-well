import { redirect } from "next/navigation"
import { getActor } from "@/lib/tenant"
import TopNav from "@/app/components/layout/TopNav"
import BottomNav from "@/app/components/layout/BottomNav"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  if (!actor || !actor.isAdmin) redirect("/")

  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas)" }}>
      <TopNav />
      {children}
      <BottomNav />
    </div>
  )
}
