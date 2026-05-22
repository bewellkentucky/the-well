import { auth } from "@/auth"
import { db } from "@/lib/db"
import Composer from "./Composer"

export default async function ComposerWrapper() {
  const session = await auth()
  if (!session?.user?.id) return null

  const [users, sender] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      select: { id: true, fullName: true, email: true, title: true, thumbnailUrl: true },
      orderBy: { fullName: "asc" },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { givingBalance: true },
    }),
  ])

  return (
    <Composer
      users={users}
      initialGivingBalance={sender?.givingBalance ?? 0}
      currentUserId={session.user.id}
    />
  )
}
