"use client"

import { useState, useRef, useEffect } from "react"
import Avatar from "@/app/components/ui/Avatar"
import { doSignOut } from "@/app/actions/auth"

export default function UserDropdown({
  name,
  thumbnailUrl,
}: {
  name:         string
  thumbnailUrl: string | null
}) {
  const firstName = name.split(" ")[0] || name
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
        <Avatar name={name} thumbnailUrl={thumbnailUrl} size="md" />
      </button>

      {open && (
        <div className="user-dd-panel" role="menu">
          {/* Greeting */}
          <div className="user-dd-header">
            <div className="user-dd-greeting">Hi, {firstName}!</div>
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
