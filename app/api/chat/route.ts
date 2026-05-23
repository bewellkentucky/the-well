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

// ── Types (new Chat API event format) ─────────────────────────────────────────
//
// Google Chat now sends events under body.chat with a payload key that
// indicates the event kind — there is NO top-level "type" field.
//
// body.chat.messagePayload        → a user sent a message
// body.chat.addedToSpacePayload   → app added to a space
// body.chat.removedFromSpacePayload → app removed from a space

type NewChatUser = {
  email:        string
  displayName?: string
  name?:        string
}

type NewChatMessage = {
  sender: NewChatUser
  text:   string
  name?:  string
}

type NewChatSpace = {
  spaceType:    string   // e.g. "DIRECT_MESSAGE" | "SPACE"
  name?:        string
  displayName?: string
}

type MessagePayload = {
  message: NewChatMessage
  space:   NewChatSpace
}

type ChatBody = {
  chat: {
    user?:                    NewChatUser
    messagePayload?:          MessagePayload
    addedToSpacePayload?:     unknown
    removedFromSpacePayload?: unknown
  }
}

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
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new NextResponse("Bad Request", { status: 400 })
  }

  // ── Step 5: Dispatch on payload key under body.chat.
  const chat = (body as ChatBody).chat
  if (!chat) {
    return NextResponse.json({})
  }

  if (chat.addedToSpacePayload !== undefined) {
    // Synchronous text replies to add-to-space are auto-deleted by Chat.
    return NextResponse.json({})
  }

  if (chat.removedFromSpacePayload !== undefined) {
    return NextResponse.json({})
  }

  if (chat.messagePayload !== undefined) {
    const { message } = chat.messagePayload
    // Prefer message.sender.email; fall back to top-level user.email.
    const senderEmail = message.sender?.email ?? chat.user?.email ?? ""

    let replyText: string
    try {
      replyText = (await handleMessage(senderEmail)).text
    } catch {
      replyText = "Something went wrong. Please try again."
    }

    // The new Chat API (add-ons framework) requires the response wrapped in
    // hostAppDataAction — a bare { text } is only valid for the classic bot format.
    return NextResponse.json({
      hostAppDataAction: {
        chatDataAction: {
          createMessageAction: {
            message: { text: replyText },
          },
        },
      },
    })
  }

  return NextResponse.json({})
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleMessage(senderEmail: string): Promise<{ text: string }> {
  if (!senderEmail) {
    return { text: "I couldn't identify your account. Sign in at thewell.bewellkentucky.com first." }
  }

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
