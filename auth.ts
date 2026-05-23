import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { db } from "@/lib/db"

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "bewellkentucky.com"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          hd: ALLOWED_DOMAIN,
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, account }) {
      const email = profile?.email
      const domain = email?.split("@")[1]
      if (domain !== ALLOWED_DOMAIN || !email) return false

      // Fire the UserInfo fetch without awaiting it — saves ~200ms per sign-in.
      // Google Workspace internal apps don't include `picture` in the ID token,
      // so we fetch it separately. The photo update lands ~200ms after login
      // completes; on a user's very first sign-in their avatar may be briefly
      // absent until the background write finishes.
      const thumbnailPromise: Promise<string | null> = account?.access_token
        ? fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
            headers: { Authorization: `Bearer ${account.access_token}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((info) => info?.picture ?? null)
            .catch(() => null)
        : Promise.resolve(null)

      // Upsert immediately — name and googleId stay in sync without waiting for photo.
      await db.user.upsert({
        where: { email },
        create: {
          email,
          googleId:     profile.sub,
          fullName:     profile.name ?? email,
          thumbnailUrl: null,
          domain:       ALLOWED_DOMAIN,
        },
        update: {
          fullName: profile.name ?? undefined,
          googleId: profile.sub  ?? undefined,
        },
      })

      // Write photo once the fetch resolves — non-blocking relative to login.
      thumbnailPromise.then((thumbnailUrl) => {
        if (thumbnailUrl) {
          db.user.update({ where: { email }, data: { thumbnailUrl } }).catch(() => {})
        }
      })

      return true
    },
    async jwt({ token, trigger }) {
      // Cache user data in the JWT on sign-in so session() needs no DB query.
      // To revoke access immediately: rotate AUTH_SECRET in Vercel env vars —
      // all existing tokens become invalid and everyone must re-authenticate.
      if ((trigger === "signIn" || trigger === "signUp") && token.email) {
        const user = await db.user.findUnique({
          where: { email: token.email },
          select: { id: true, role: true, entity: true, active: true, thumbnailUrl: true },
        })
        if (user) {
          token.userId       = user.id
          token.role         = user.role
          token.entity       = user.entity
          token.active       = user.active
          token.thumbnailUrl = user.thumbnailUrl
        }
      }
      return token
    },
    async session({ session, token }) {
      // Reads from JWT — zero DB round-trips per request.
      // Inactive users: id stays unset, every page redirects to sign-in.
      if (token.active === false) return session
      if (token.userId) {
        session.user.id     = token.userId      as string
        session.user.role   = token.role        as string
        session.user.entity = token.entity      as string
        session.user.image  = (token.thumbnailUrl as string | null) ?? session.user.image ?? null
      }
      return session
    },
  },
})
