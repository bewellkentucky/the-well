import { requireActor } from "@/lib/tenant"
import Composer from "./Composer"

export default async function ComposerWrapper() {
  const actor = await requireActor()

  const [users, sender] = await Promise.all([
    actor.db.user.findMany({
      where: { active: true },
      select: { id: true, fullName: true, email: true, title: true, thumbnailUrl: true },
      orderBy: { fullName: "asc" },
    }),
    actor.db.user.findUnique({
      where: { id: actor.userId },
      select: { givingBalance: true },
    }),
  ])

  return (
    <Composer
      users={users}
      initialGivingBalance={sender?.givingBalance ?? 0}
      currentUserId={actor.userId}
    />
  )
}
