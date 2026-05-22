import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return new NextResponse(null, { status: 401 })
  }

  const url = req.nextUrl.searchParams.get("url")
  if (!url) return new NextResponse(null, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  // Only proxy Google profile photo CDN — no open redirect
  if (parsed.hostname !== "lh3.googleusercontent.com") {
    return new NextResponse(null, { status: 400 })
  }

  try {
    const res = await fetch(url)
    if (!res.ok) return new NextResponse(null, { status: 404 })

    const data = await res.arrayBuffer()
    return new NextResponse(data, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
