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

      // Google Workspace internal OAuth apps don't include `picture` in the
      // ID token. Fetch it from the UserInfo endpoint using the access token.
      let thumbnailUrl: string | null = null
      if (account?.access_token) {
        try {
          const res = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
            headers: { Authorization: `Bearer ${account.access_token}` },
          })
          if (res.ok) {
            const info = await res.json()
            thumbnailUrl = info.picture ?? null
          }
        } catch {
          // Non-fatal — no photo is fine
        }
      }

      // Upsert on every sign-in so name and photo stay in sync with Google.
      await db.user.upsert({
        where: { email },
        create: {
          email,
          googleId: profile.sub,
          fullName: profile.name ?? email,
          thumbnailUrl,
          domain: ALLOWED_DOMAIN,
        },
        update: {
          fullName: profile.name ?? undefined,
          thumbnailUrl: thumbnailUrl ?? undefined,
          googleId: profile.sub ?? undefined,
        },
      })

      return true
    },
    async session({ session, token }) {
      if (session.user?.email) {
        const user = await db.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, role: true, entity: true, active: true, thumbnailUrl: true },
        })
        if (!user?.active) return session
        session.user.id = user.id
        session.user.role = user.role
        session.user.entity = user.entity
        session.user.image = user.thumbnailUrl ?? session.user.image ?? null
      }
      return session
    },
  },
})
