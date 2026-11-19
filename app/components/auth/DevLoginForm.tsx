import { signIn } from "@/auth"
import { db } from "@/lib/db"
import { devLoginEnabled } from "@/lib/devLogin"

// Local development only (see lib/devLogin.ts). Lists seeded, fictional
// people so layouts can be checked without Google OAuth.
export default async function DevLoginForm() {
  if (!devLoginEnabled()) return null

  const people = await db.user.findMany({
    where: { active: true },
    orderBy: [{ company: { name: "asc" } }, { role: "asc" }, { fullName: "asc" }],
    select: { id: true, fullName: true, role: true, isPlatformOwner: true, company: { select: { name: true } } },
    take: 200,
  })
  if (people.length === 0) return null

  async function devSignIn(formData: FormData) {
    "use server"
    if (!devLoginEnabled()) return
    await signIn("dev-login", { userId: String(formData.get("userId") ?? ""), redirectTo: "/" })
  }

  return (
    <form action={devSignIn} className="signin-dev">
      <span className="signin-dev-label">Local dev only</span>
      <select name="userId" aria-label="Sign in as">
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.company.name}: {p.fullName}
            {p.isPlatformOwner ? " (platform owner)" : p.role === "admin" ? " (admin)" : ""}
          </option>
        ))}
      </select>
      <button type="submit">Sign in as this person</button>
    </form>
  )
}
