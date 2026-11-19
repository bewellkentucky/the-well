import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import { resolveGoogleSignIn } from "@/lib/signIn"
import { devLoginEnabled } from "@/lib/devLogin"
import { canUseCompany } from "@/lib/launch"
import { isBlockedSignIn } from "@/lib/blockedSignIns"

// Multi-tenant sign-in: which company a person belongs to is decided by
// lib/signIn.ts from their Google Workspace domain (CompanyDomain table).
// The session carries identity only (user id). Company, role and active
// status are re-read from the database on every request (lib/tenant.ts).

const providers = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    authorization: {
      params: {
        // "*" limits the Google account chooser to Workspace accounts. It is a
        // UI hint only; the real check is the hd claim in lib/signIn.ts.
        hd: "*",
        prompt: "select_account",
      },
    },
  }),
  ...(devLoginEnabled()
    ? [
        Credentials({
          id: "dev-login",
          name: "Local dev login",
          credentials: { userId: { label: "User id", type: "text" } },
          async authorize(credentials) {
            if (!devLoginEnabled()) return null
            const userId = typeof credentials?.userId === "string" ? credentials.userId : ""
            const user = await db.user.findUnique({
              where: { id: userId },
              select: { id: true, email: true, fullName: true, active: true, role: true, isPlatformOwner: true, isTester: true, company: { select: { isOpen: true, blockedSignIns: true } } },
            })
            if (!user || !user.active) return null
            // Same launch rule as Google sign-in (getActor enforces it too).
            if (!canUseCompany(user.company, user)) return null
            if (isBlockedSignIn(user.company, user.email)) return null
            return { id: user.id, email: user.email, name: user.fullName }
          },
        }),
      ]
    : []),
]

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "dev-login") return devLoginEnabled()
      if (account?.provider !== "google") return false

      const result = await resolveGoogleSignIn(db, profile)
      if (!result.ok) {
        // Closed company: the calm "coming soon" page, branded by company slug.
        if (result.reason === "closed" || result.reason === "blocked")
          return `/?signin=${result.reason}&c=${encodeURIComponent(result.companySlug)}`
        return `/?signin=${result.reason}`
      }

      // Google Workspace ID tokens often omit `picture`; fetch it in the
      // background so sign-in isn't slowed down.
      if (account.access_token) {
        fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
          headers: { Authorization: `Bearer ${account.access_token}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((info) => {
            const pic = typeof info?.picture === "string" ? info.picture : null
            if (pic) db.user.update({ where: { id: result.userId }, data: { thumbnailUrl: pic } }).catch(() => {})
          })
          .catch(() => {})
      }
      return true
    },
    async jwt({ token, user, account, profile, trigger }) {
      if (trigger === "signIn" || trigger === "signUp") {
        if (account?.provider === "google" && profile?.sub) {
          const row = await db.user.findUnique({ where: { googleId: profile.sub }, select: { id: true, thumbnailUrl: true } })
          token.userId = row?.id
          token.thumbnailUrl = row?.thumbnailUrl ?? null
        } else if (account?.provider === "dev-login" && user?.id) {
          token.userId = user.id
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string
        session.user.image = (token.thumbnailUrl as string | null) ?? session.user.image ?? null
      }
      return session
    },
  },
})
