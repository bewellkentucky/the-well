import { GoogleAuth } from "google-auth-library"
import { STAR, PRODUCT_NAME } from "@/lib/brand"

type Params = {
  /** Launch switch: a closed company never posts. */
  companyOpen: boolean
  isPrivate: boolean
  /** The company's own Chat space. null = this company does not post. */
  chatSpace: string | null
  appUrl: string | null
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

/** Pure: should this kudo be posted, and where? Exported for tests. */
export function chatTarget(p: Pick<Params, "isPrivate" | "chatSpace" | "companyOpen">): string | null {
  // Launch gate: nothing leaves Spotlight for a closed company.
  if (p.companyOpen !== true) return null
  // Privacy gate (permanent): post ONLY when isPrivate is explicitly false.
  if (p.isPrivate !== false) return null
  // Tenant gate: only into this company's own space; no space = no post.
  if (!p.chatSpace || !/^spaces\/[A-Za-z0-9_-]+$/.test(p.chatSpace)) return null
  return p.chatSpace
}

export async function postKudoToChat(params: Params): Promise<void> {
  const space = chatTarget(params)
  if (!space) return

  const saKey = process.env.GCHAT_SA_KEY
  if (!saKey) return // local dev without credentials: silent no-op

  try {
    const client = await getAuth(saKey).getClient()
    const { token } = await client.getAccessToken()
    if (!token) throw new Error("empty access token")

    const link = params.appUrl ? `\n<${params.appUrl}|View in ${PRODUCT_NAME}>` : ""
    const text =
      `${STAR} ${params.giverName} recognized ${params.recipientName}: ${params.amount} ${STAR} · ${params.values.join(", ")}\n${params.message}${link}`

    const res = await fetch(`https://chat.googleapis.com/v1/${space}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) console.error("postKudoToChat: HTTP", res.status)
  } catch {
    console.error("postKudoToChat: failed")
  }
}
