"use client"

import { useState } from "react"
import { avatarColor } from "@/lib/avatarColor"

type Size = "sm" | "md" | "lg"

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

export default function Avatar({
  name,
  email,
  thumbnailUrl,
  size = "md",
}: {
  name: string
  email: string
  thumbnailUrl?: string | null
  size?: Size
}) {
  const [failed, setFailed] = useState(false)
  const color = avatarColor(email)
  const sizeClass = size === "md" ? "" : size

  if (thumbnailUrl && !failed) {
    const src = thumbnailUrl.startsWith("https://lh3.googleusercontent.com/")
      ? `/api/avatar?url=${encodeURIComponent(thumbnailUrl)}`
      : thumbnailUrl
    return (
      <img
        src={src}
        alt={name}
        className={`avatar ${sizeClass}`.trim()}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div className={`avatar ${sizeClass} ${color}`.trim()}>
      {initials(name)}
    </div>
  )
}
