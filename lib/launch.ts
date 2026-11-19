// Launch switch (Company.isOpen). Plain module, no database access.
//
// While a company is closed:
//  - only platform owners, the company's admins and people flagged as testers
//    (User.isTester) can sign in or use the app;
//  - everyone else from its domains sees "Spotlight is coming soon", and no
//    user row is created for them (lib/signIn.ts audits the refusal);
//  - no Chat post, allowance reset or other outbound action runs for it. The
//    exception is BambooHR sync (cron, admin button, CLI): read-only GETs that
//    send nothing to staff, so people can be pre-loaded before launch. People
//    it creates or updates are never admins or testers, so they still can't
//    sign in. The keep-warm cron touches no company and is unaffected.
// Opening (or closing) is a platform-owner action in /platform, audit-logged.

export type LaunchPerson = { role: string; isPlatformOwner: boolean; isTester: boolean }

/** May this person use Spotlight before their company opens? */
export function admittedBeforeLaunch(p: LaunchPerson): boolean {
  return p.isPlatformOwner || p.role === "admin" || p.isTester
}

/** May this person use Spotlight right now? */
export function canUseCompany(company: { isOpen: boolean }, p: LaunchPerson): boolean {
  return company.isOpen || admittedBeforeLaunch(p)
}

export const COMING_SOON_TITLE = "Spotlight is coming soon"
export const COMING_SOON_BODY =
  "Your team is getting Spotlight ready. You'll be able to sign in once it opens. Nothing to do until then."
