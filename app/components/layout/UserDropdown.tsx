"use client"

import { useState, useRef, useEffect } from "react"
import Avatar from "@/app/components/ui/Avatar"
import { doSignOut } from "@/app/actions/auth"

export default function UserDropdown({
  name,
  email,
  thumbnailUrl,
}: {
  name:         string
  email:        string
  thumbnailUrl: string | null
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div className="user-dd-wrap" ref={wrapRef}>
      <button
        type="button"
        className="user-dd-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
      >
        <Avatar name={name} email={email} thumbnailUrl={thumbnailUrl} size="md" />
      </button>

      {open && (
        <div className="user-dd-panel" role="menu">
          {/* User info header */}
          <div className="user-dd-header">
            <Avatar name={name} email={email} thumbnailUrl={thumbnailUrl} size="lg" />
            <div className="user-dd-name">{name}</div>
          </div>

          {/* Menu items */}
          <div className="user-dd-items">
            <form action={doSignOut}>
              <button type="submit" className="user-dd-item" role="menuitem">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
