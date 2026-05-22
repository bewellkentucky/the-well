"use client"

import { useState } from "react"
import Avatar from "@/app/components/ui/Avatar"

export type DirectoryUser = {
  id: string
  fullName: string
  email: string
  title: string | null
  department: string | null
  role: string
  thumbnailUrl: string | null
}

function PersonCard({ user }: { user: DirectoryUser }) {
  const titleLine = [user.title, user.department].filter(Boolean).join(" · ")

  return (
    <div className="person-card">
      <Avatar name={user.fullName} email={user.email} thumbnailUrl={user.thumbnailUrl} size="lg" />
      <div className="person-info">
        <div className="person-name">{user.fullName}</div>
        {titleLine && <div className="person-title">{titleLine}</div>}
        <div className="person-email">{user.email}</div>
      </div>
    </div>
  )
}

export default function DirectoryGrid({
  users,
  totalCount,
}: {
  users: DirectoryUser[]
  totalCount: number
}) {
  const [query, setQuery] = useState("")

  const q = query.toLowerCase()
  const filtered = q
    ? users.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.title ?? "").toLowerCase().includes(q) ||
          (u.department ?? "").toLowerCase().includes(q)
      )
    : users

  return (
    <>
      <div className="dir-topbar">
        <div>
          <h1 className="page-title">Team directory</h1>
          <p className="page-subtitle">
            {totalCount} active teammate{totalCount !== 1 ? "s" : ""} across{" "}
            <strong>@bewellkentucky.com</strong>
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <input
          className="recipient-input"
          type="search"
          placeholder="Search by name, email, or role…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ margin: 0 }}
        />
      </div>

      <div className="directory-grid">
        {filtered.length > 0 ? (
          filtered.map((u) => <PersonCard key={u.id} user={u} />)
        ) : (
          <div className="dir-empty">No teammates matching that search.</div>
        )}
      </div>
    </>
  )
}
