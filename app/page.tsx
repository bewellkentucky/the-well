import { auth, signIn, signOut } from "@/auth"
import { db } from "@/lib/db"
import PageShell from "@/app/components/layout/PageShell"
import ComposerWrapper from "@/app/components/composer/ComposerWrapper"
import Feed from "@/app/components/feed/Feed"
import FeaturedIncentives from "@/app/components/feed/FeaturedIncentives"
import Leaderboard from "@/app/components/rail/Leaderboard"
import ComingUp from "@/app/components/rail/ComingUp"
import OutToday from "@/app/components/rail/OutToday"
import { buildRelevantClaims } from "@/lib/relevantClaims"
import SpotlightMark from "@/app/components/brand/SpotlightMark"
import DevLoginForm from "@/app/components/auth/DevLoginForm"

export default async function Home() {
  const session = await auth()

  if (!session?.user?.id) {
    return <SignInPage />
  }

  const now = new Date()

  const [user, featuredSetting, candidateIncentives, rawClaims] = await Promise.all([
    db.user.findUnique({
      where:  { id: session.user.id },
      select: { givingBalance: true, balance: true },
    }),
    db.appSetting.findUnique({
      where:  { key: "featuredCount" },
      select: { value: true },
    }),
    db.incentive.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt:   null }, { endsAt:   { gt:  now } }] },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take:    10,
      select:  {
        id: true, title: true, description: true, reward: true,
        verification: true, cap: true, icon: true, color: true,
        proofPrompt: true, startsAt: true, endsAt: true,
      },
    }),
    db.incentiveClaim.findMany({
      where: {
        userId: session.user.id,
        status: { not: "declined" },
      },
      select: { incentiveId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ])
  const featuredCount = Math.max(0, parseInt(featuredSetting?.value ?? "2", 10) || 2)
  const featuredIncentives = candidateIncentives.slice(0, featuredCount)
  const featuredClaims = buildRelevantClaims(featuredIncentives, rawClaims, now)

  return (
    <PageShell>
      <main className="home-layout mx-auto" style={{ maxWidth: 1100, padding: "32px 24px 100px" }}>

        {/* Full-width header row — spans both columns */}
        <div className="feed-title-col">
          <h1 className="feed-topbar-title">Recognize the work.</h1>
          <p className="feed-topbar-subtitle">
            Send kudos, give stars, celebrate your team.
          </p>
        </div>

        {/* Left column: composer + featured incentives + feed */}
        <div>
          <ComposerWrapper />
          <FeaturedIncentives incentives={featuredIncentives} claims={featuredClaims} />
          <Feed currentUserId={session.user.id} />
        </div>

        {/* Right column: balance widget → top givers → coming up */}
        <aside className="home-rail">
          <div className="drops-balance rail-section">
            <div className="drops-pool">
              <div className="balance-amount">{user?.givingBalance ?? 0} ⭐</div>
              <div className="balance-label">To give this month</div>
            </div>
            <div className="drops-balance-h-divider" />
            <div className="drops-pool">
              <div className="balance-amount">{user?.balance ?? 0} ⭐</div>
              <div className="balance-label" style={{ color: "rgba(244,241,236,0.5)" }}>
                Earned&nbsp;&middot;&nbsp;yours to spend
              </div>
            </div>
          </div>
          <Leaderboard />
          <ComingUp />
          <OutToday />
        </aside>
      </main>
    </PageShell>
  )
}

function SignInPage({
  companyName,
  logoUrl,
  error,
}: {
  companyName?: string | null
  logoUrl?: string | null
  error?: string | null
}) {
  return (
    <main className="signin-page">
      <div className="signin-inner">
        <div className="signin-brand">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={companyName ?? ""} className="signin-logo" />
          ) : (
            <SpotlightMark size={64} className="signin-mark" />
          )}
          <div className="signin-titles">
            <h1 className="signin-title">Spotlight</h1>
            {companyName && <p className="signin-company">{companyName}</p>}
          </div>
        </div>

        <div className="signin-card">
          <h2 className="signin-welcome">Welcome back</h2>
          <p className="signin-hint">Sign in with your work Google account.</p>
          {error && <p className="signin-error">{error}</p>}
          <form
            action={async () => {
              "use server"
              await signIn("google", { redirectTo: "/" })
            }}
            className="w-full"
          >
            <button type="submit" className="signin-btn">
              <GoogleIcon />
              Sign in with Google
            </button>
          </form>
          <DevLoginForm />
        </div>
      </div>
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" />
    </svg>
  )
}
