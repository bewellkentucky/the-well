import { NextRequest, NextResponse } from "next/server"
import { OAuth2Client } from "google-auth-library"
import type { TokenPayload } from "google-auth-library"
import { db } from "@/lib/db"

export const maxDuration = 30

// ── Constants ─────────────────────────────────────────────────────────────────

// Google's standard OAuth issuer — what Chat HTTP endpoints receive.
const CHAT_ISSUER = "https://accounts.google.com"

// Module-level singleton. OAuth2Client internally caches the public certs it
// fetches from Google, keyed by key-id, respecting cache-control. On a warm
// Vercel instance this means one cert fetch per cold start, not per request.
const authClient = new OAuth2Client()

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatUser = {
  name:        string   // "users/{userId}"
  displayName: string
  email:       string
  type:        "HUMAN" | "BOT"
}

type ChatSpace = {
  name:         string
  type:         "DM" | "ROOM" | "SPACE"
  displayName?: string
}

type ChatMessage = {
  name:          string
  sender:        ChatUser
  text:          string
  slashCommand?: { commandId: number }
}

type ChatEvent = {
  type:     "MESSAGE" | "ADDED_TO_SPACE" | "REMOVED_FROM_SPACE" | "CARD_CLICKED"
  space:    ChatSpace
  user:     ChatUser
  message?: ChatMessage
  common?:  {
    invokedFunction?: string
    parameters?:      Array<{ key: string; value: string }>
  }
}

type ChatTextResponse = { text: string }

// ── Endpoint ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {

  // ── Guard: env var must be present before any verification attempt.
  //    If audience is undefined, verifyIdToken skips the aud check entirely —
  //    that would silently accept any Google-signed JWT. Fail closed instead.
  const chatAudience = process.env.CHAT_AUDIENCE
  if (!chatAudience) {
    console.error("CHAT_AUDIENCE is not configured")
    return new NextResponse("Service Unavailable", { status: 503 })
  }

  // ── Step 1: Extract Bearer token.
  //    Reject before parsing body or touching the DB if the header is absent
  //    or malformed. "Bearer " is exactly 7 characters.
  const authHeader = req.headers.get("authorization") ?? ""
  if (!authHeader.startsWith("Bearer ")) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const token = authHeader.slice(7)

  // ── Step 2: Verify the JWT.
  //    verifyIdToken fetches Google's public certs for the token's issuer,
  //    verifies the RS256 signature against the cert matching the token's kid,
  //    and asserts that:
  //      • exp has not passed
  //      • aud exactly matches our endpoint URL (CHAT_AUDIENCE)
  //    It throws on any failure — we treat all failures as 401.
  let payload: TokenPayload
  try {
    const ticket = await authClient.verifyIdToken({
      idToken:  token,
      audience: chatAudience,
    })
    const raw = ticket.getPayload()
    if (!raw) throw new Error("empty payload")
    payload = raw
  } catch {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  // ── Step 3: Pin the issuer.
  //    verifyIdToken accepts multiple Google issuers; we assert this explicitly.
  //    Since iss is now Google's standard OAuth issuer (shared across many
  //    Google services), the aud check above is the primary discriminator —
  //    only tokens minted for our exact endpoint URL pass both checks.
  if (payload.iss !== CHAT_ISSUER) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  // ── Step 4: Parse the event body.
  //    Verification is complete before we read any user-supplied data.
  let event: ChatEvent
  try {
    event = (await req.json()) as ChatEvent
  } catch {
    return new NextResponse("Bad Request", { status: 400 })
  }

  // ── Step 5: Dispatch on event type.
  switch (event.type) {
    case "ADDED_TO_SPACE":
      return NextResponse.json(handleAddedToSpace())

    case "REMOVED_FROM_SPACE":
      // No action needed. Return 200 with no body.
      return new NextResponse(null, { status: 200 })

    case "MESSAGE":
      return NextResponse.json(await handleMessage(event))

    case "CARD_CLICKED":
      // Reserved for Phase 3 (interactive rain/reaction callbacks).
      // Acknowledge without action until that logic is built and reviewed.
      return NextResponse.json({ text: "" })

    default:
      return new NextResponse(null, { status: 200 })
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function handleAddedToSpace(): ChatTextResponse {
  return {
    text: "Hi! I'm The Well, Be Well Kentucky's recognition app. Staff can give kudos and earn drops right here in Chat. More features coming soon.",
  }
}

async function handleMessage(event: ChatEvent): Promise<ChatTextResponse> {
  const senderEmail = event.user.email

  // Resolve Chat identity → Well user by email.
  // email has @unique in the schema → implicit Postgres index, fast lookup.
  // NEVER auto-create an account from a Chat interaction.
  const wellUser = await db.user.findUnique({
    where:  { email: senderEmail },
    select: { fullName: true },
  })

  if (!wellUser) {
    return {
      text: "I don't see a Well account for your email. Sign in at thewell.bewellkentucky.com first, then come back.",
    }
  }

  const firstName = wellUser.fullName.split(" ")[0] ?? wellUser.fullName

  // First-pass confirmation — verifies the full round-trip is working.
  // Command routing and money logic will be added in later passes.
  return {
    text: `Hi ${firstName}, The Well is connected.`,
  }
}
