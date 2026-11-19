import { signIn, signOut } from "@/auth"
import { getActor } from "@/lib/tenant"
import { getRequestBrand, getComingSoonBrand } from "@/lib/brandContext"
import { COMING_SOON_BODY, COMING_SOON_TITLE } from "@/lib/launch"
import { themeCss } from "@/lib/theme"
import type { CompanyBrand } from "@/lib/branding"
import { SIGN_IN_MESSAGES, type SignInDenied } from "@/lib/signIn"
import { buildClaimStatuses } from "@/lib/incentives"
import { listFeaturedIncentives } from "@/lib/incentiveQueries"
import { formatStars } from "@/lib/brand"
import PageShell from "@/app/components/layout/PageShell"
import ComposerWrapper from "@/app/components/composer/ComposerWrapper"
import Feed from "@/app/components/feed/Feed"
import FeaturedIncentives from "@/app/components/feed/FeaturedIncentives"
import Leaderboard from "@/app/components/rail/Leaderboard"
import ComingUp from "@/app/components/rail/ComingUp"
import OutToday from "@/app/components/rail/OutToday"
import SpotlightMark from "@/app/components/brand/SpotlightMark"
import DevLoginForm from "@/app/components/auth/DevLoginForm"

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string; error?: string; c?: string }>
}) {
  const actor = await getActor()

  if (!actor) {
    const params = await searchParams
    // Launch switch: a closed company shows "coming soon", never an error.
    const soon = await getComingSoonBrand(params.signin === "closed" ? params.c : undefined)
    if (soon || params.signin === "closed") {
      return <ComingSoonPage brand={soon ?? (await getRequestBrand())} />
    }
    const brand = await getRequestBrand()
    const code = params.signin as SignInDenied | undefined
    const error =
      code && code in SIGN_IN_MESSAGES
        ? SIGN_IN_MESSAGES[code]
        : params.error
          ? "Sign-in didn't work. Please try again."
          : null
    return <SignInPage companyName={brand?.name} companyShortName={brand?.shortName} logoUrl={brand?.logoUrl} error={error} />
  }

  const now = new Date()
  const sdb = actor.db

  const [user, company, featuredIncentives, rawClaims] = await Promise.all([
    sdb.user.findUnique({
      where: { id: actor.userId },
      select: { givingBalance: true, balance: true },
    }),
    sdb.company.findUnique({
      where: { id: actor.companyId },
      select: { name: true },
    }),
    listFeaturedIncentives(sdb, actor.companyId, now),
    sdb.incentiveClaim.findMany({
      where: { userId: actor.userId, status: { not: "declined" } },
      select: { incentiveId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ])
  const featuredClaims = buildClaimStatuses(featuredIncentives, rawClaims, now)

  return (
    <PageShell>
      <main className="home-layout mx-auto" style={{ maxWidth: 1100, padding: "32px 24px 100px" }}>

        {/* Full-width header row — spans both columns */}
        <div className="feed-title-col">
          <h1 className="feed-topbar-title">Recognize the work.</h1>
          <p className="feed-topbar-subtitle">
            Send kudos, give stars, celebrate your team{company?.name ? ` at ${company.name}` : ""}.
          </p>
        </div>

        {/* Left column: composer + featured incentives + feed */}
        <div>
          <ComposerWrapper />
          <FeaturedIncentives incentives={featuredIncentives} claims={featuredClaims} />
          <Feed />
        </div>

        {/* Right column: balance widget → top givers → coming up */}
        <aside className="home-rail">
          <div className="drops-balance rail-section">
            <div className="drops-pool">
              <div className="balance-amount">{formatStars(user?.givingBalance ?? 0)}</div>
              <div className="balance-label">To give this month</div>
            </div>
            <div className="drops-balance-h-divider" />
            <div className="drops-pool">
              <div className="balance-amount">{formatStars(user?.balance ?? 0)}</div>
              <div className="balance-label" style={{ color: "rgba(247,245,242,0.55)" }}>
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
  companyShortName,
  logoUrl,
  error,
}: {
  companyName?: string | null
  companyShortName?: string | null
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
            {companyName && (
              <p className="signin-company">
                {companyShortName ? (
                  <>
                    <span className="signin-company-full">{companyName}</span>
                    <span className="signin-company-short">{companyShortName}</span>
                  </>
                ) : (
                  companyName
                )}
              </p>
            )}
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

function ComingSoonPage({ brand }: { brand: CompanyBrand | null }) {
  return (
    <main className="signin-page">
      {brand?.theme ? <style>{themeCss(brand.theme)}</style> : null}
      <div className="signin-inner">
        <div className="signin-brand">
          {brand?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name} className="signin-logo" />
          ) : (
            <SpotlightMark size={64} className="signin-mark" />
          )}
          <div className="signin-titles">
            <h1 className="signin-title">Spotlight</h1>
            {brand?.name && <p className="signin-company">{brand.name}</p>}
          </div>
        </div>

        <div className="signin-card coming-soon-card">
          <h2 className="signin-welcome">{COMING_SOON_TITLE}</h2>
          <p className="signin-hint">{COMING_SOON_BODY}</p>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/" })
            }}
          >
            <button type="submit" className="coming-soon-link">Use a different account</button>
          </form>
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
