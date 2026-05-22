import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import PageShell from "@/app/components/layout/PageShell"
import Avatar from "@/app/components/ui/Avatar"

// ── Date helpers (same UTC-safe pattern as ComingUp) ─────────────────────────

// Next occurrence of a month/day on or after today (local time construction
// so getDate()/toLocaleString() on the result are safe to use directly).
function nextOccurrence(utcMonth: number, utcDay: number, today: Date): Date {
  const thisYear = new Date(today.getFullYear(), utcMonth, utcDay)
  if (thisYear >= today) return thisYear
  return new Date(today.getFullYear() + 1, utcMonth, utcDay)
}

function formatMonthHeader(date: Date): string {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" })
}

// ── Types ─────────────────────────────────────────────────────────────────────

type MilestoneEvent = {
  key: string
  fullName: string
  email: string
  thumbnailUrl: string | null
  type: "Birthday" | "Work anniversary"
  next: Date        // local-time date for display and sorting
  years: number | null
}

type TenureRow = {
  id: string
  fullName: string
  email: string
  thumbnailUrl: string | null
  title: string | null
  years: number
  hireDate: Date
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getMilestones() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const windowEnd = new Date(today)
  windowEnd.setFullYear(windowEnd.getFullYear() + 1)

  const users = await db.user.findMany({
    where: {
      active: true,
      OR: [{ birthday: { not: null } }, { hireDate: { not: null } }],
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      thumbnailUrl: true,
      title: true,
      birthday: true,
      hireDate: true,
    },
  })

  const events: MilestoneEvent[] = []

  for (const u of users) {
    if (u.birthday) {
      const next = nextOccurrence(u.birthday.getUTCMonth(), u.birthday.getUTCDate(), today)
      if (next <= windowEnd) {
        events.push({
          key: `${u.id}-bday`,
          fullName: u.fullName,
          email: u.email,
          thumbnailUrl: u.thumbnailUrl,
          type: "Birthday",
          next,
          years: null,
        })
      }
    }
    if (u.hireDate) {
      const next = nextOccurrence(u.hireDate.getUTCMonth(), u.hireDate.getUTCDate(), today)
      const years = next.getFullYear() - u.hireDate.getUTCFullYear()
      if (next <= windowEnd && years > 0) {
        events.push({
          key: `${u.id}-anni`,
          fullName: u.fullName,
          email: u.email,
          thumbnailUrl: u.thumbnailUrl,
          type: "Work anniversary",
          next,
          years,
        })
      }
    }
  }

  events.sort((a, b) => a.next.getTime() - b.next.getTime())

  // Group by "Month Year"
  const grouped = new Map<string, MilestoneEvent[]>()
  for (const e of events) {
    const key = formatMonthHeader(e.next)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(e)
  }

  // Tenure list — all users with a hireDate, sorted longest first
  const tenureRows: TenureRow[] = users
    .filter((u) => u.hireDate)
    .map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      thumbnailUrl: u.thumbnailUrl,
      title: u.title,
      years: today.getFullYear() - u.hireDate!.getUTCFullYear(),
      hireDate: u.hireDate!,
    }))
    .filter((r) => r.years >= 0)
    .sort((a, b) => a.hireDate.getTime() - b.hireDate.getTime())

  return { grouped, tenureRows }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DatesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/")

  const { grouped, tenureRows } = await getMilestones()

  return (
    <PageShell>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 100px" }}>
        <div className="dir-topbar" style={{ marginBottom: 28 }}>
          <div>
            <h1 className="page-title">Milestones</h1>
            <p className="page-subtitle">Birthdays and work anniversaries synced from BambooHR.</p>
          </div>
        </div>

        <div className="dates-grid">
          {/* Left: rolling 12-month calendar */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Upcoming</h2>
            </div>

            {grouped.size === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: "16px 0" }}>
                No upcoming milestones found.
              </p>
            ) : (
              Array.from(grouped.entries()).map(([month, events]) => (
                <div key={month} className="dates-month-group">
                  <div className="dates-month-header">{month}</div>
                  {events.map((e) => {
                    const day = String(e.next.getDate()).padStart(2, "0")
                    const mon = e.next.toLocaleString("en-US", { month: "short" })
                    return (
                      <div key={e.key} className="anniversary-card">
                        <div className="anni-date">
                          {day}
                          <small>{mon}</small>
                        </div>
                        <Avatar
                          name={e.fullName}
                          email={e.email}
                          thumbnailUrl={e.thumbnailUrl}
                          size="sm"
                        />
                        <div className="anni-info">
                          <div className="anni-name">{e.fullName}</div>
                          <div className="anni-detail">{e.type}</div>
                        </div>
                        <div className="anni-years">
                          {e.years ? `${e.years}y` : "🎂"}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Right: by tenure */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">By tenure</h2>
            </div>

            {tenureRows.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", fontSize: 14, padding: "16px 0" }}>
                No hire dates on file yet.
              </p>
            ) : (
              tenureRows.map((row, i) => (
                <div key={row.id} className="leaderboard-item">
                  <div className={`rank${i < 3 ? " top" : ""}`}>{i + 1}</div>
                  <Avatar
                    name={row.fullName}
                    email={row.email}
                    thumbnailUrl={row.thumbnailUrl}
                    size="sm"
                  />
                  <div className="leader-info">
                    <div className="leader-name">{row.fullName}</div>
                    <div className="leader-meta">{row.title ?? ""}</div>
                  </div>
                  <div className="leader-points">{row.years}y</div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </PageShell>
  )
}
