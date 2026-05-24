import { GoogleAuth } from "google-auth-library"

type Params = {
  isPrivate: boolean
  giverName: string
  recipientName: string
  amount: number
  values: string[]
  message: string
}

// Lazily initialized so missing env vars in local dev are a silent no-op.
let _auth: GoogleAuth | null = null
function getAuth(saKey: string): GoogleAuth {
  if (!_auth) {
    _auth = new GoogleAuth({
      credentials: JSON.parse(saKey),
      scopes: ["https://www.googleapis.com/auth/chat.bot"],
    })
  }
  return _auth
}

export async function postKudoToChat(params: Params): Promise<void> {
  // ── Privacy gate ───────────────────────────────────────────────────────────
  // Post ONLY when isPrivate is explicitly false. If true, null, undefined,
  // or any other value → do not post. Fail-safe to silent.
  if (params.isPrivate !== false) {
    console.log("[chat-post] skipped-private")
    return
  }

  const saKey   = process.env.GCHAT_SA_KEY
  const spaceId = process.env.GCHAT_KUDOS_SPACE
  if (!saKey || !spaceId) return  // local dev without credentials — silent no-op

  try {
    const client = await getAuth(saKey).getClient()
    const { token } = await client.getAccessToken()
    if (!token) throw new Error("empty access token")

    const text =
      `💧 ${params.giverName} recognized ${params.recipientName} — ${params.amount}đ · ${params.values.join(", ")}\n${params.message}`

    const res = await fetch(`https://chat.googleapis.com/v1/${spaceId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    })

    if (!res.ok) {
      console.error("[chat-post] error:", res.status, await res.text())
      return
    }

    console.log("[chat-post] success")
  } catch (err) {
    console.error("[chat-post] error:", err)
  }
}
