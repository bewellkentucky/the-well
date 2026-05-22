import { db } from "@/lib/db"

type Event = {
  key: string
  fullName: string
  type: "Birthday" | "Work anniversary"
  date: Date
  years: number | null
}

function nextOccurrence(month: number, day: number, today: Date): Date {
  const thisYear = new Date(today.getFullYear(), month, day)
  if (thisYear >= today) return thisYear
  return new Date(today.getFullYear() + 1, month, day)
}

export default async function ComingUp() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const windowEnd = new Date(today)
  windowEnd.setDate(windowEnd.getDate() + 60)

  const users = await db.user.findMany({
    where: {
      active: true,
      OR: [{ birthday: { not: null } }, { hireDate: { not: null } }],
    },
    select: { id: true, fullName: true, birthday: true, hireDate: true },
  })

  const events: Event[] = []

  for (const u of users) {
    if (u.birthday) {
      const next = nextOccurrence(u.birthday.getUTCMonth(), u.birthday.getUTCDate(), today)
      if (next <= windowEnd) {
        events.push({ key: `${u.id}-bday`, fullName: u.fullName, type: "Birthday", date: next, years: null })
      }
    }
    if (u.hireDate) {
      const next = nextOccurrence(u.hireDate.getUTCMonth(), u.hireDate.getUTCDate(), today)
      if (next <= windowEnd) {
        const years = next.getFullYear() - u.hireDate.getUTCFullYear()
        if (years > 0) {
          events.push({ key: `${u.id}-anni`, fullName: u.fullName, type: "Work anniversary", date: next, years })
        }
      }
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime())
  const upcoming = events.slice(0, 3)

  if (upcoming.length === 0) return null

  return (
    <div className="card rail-section">
      <div className="card-header">
        <h2 className="card-title">Coming up</h2>
      </div>
      {upcoming.map((e) => {
        const day = String(e.date.getDate()).padStart(2, "0")
        const mon = e.date.toLocaleString("en-US", { month: "short" })
        return (
          <div key={e.key} className="anniversary-card">
            <div className="anni-date">
              {day}
              <small>{mon}</small>
            </div>
            <div className="anni-info">
              <div className="anni-name">{e.fullName}</div>
              <div className="anni-detail">{e.type}</div>
            </div>
            <div className="anni-years">{e.years ? `${e.years}y` : "🎂"}</div>
          </div>
        )
      })}
    </div>
  )
}
