import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import TopNav from "@/app/components/layout/TopNav"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })

  if (!user || (user.role !== "owner" && user.role !== "admin")) redirect("/")

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <TopNav />
      {children}
    </div>
  )
}
