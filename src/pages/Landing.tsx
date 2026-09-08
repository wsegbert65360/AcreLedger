import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';

import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';

// Approved Oct 1 microcopy — Growth is the source of truth for these strings
// (acreledger-growth/help-outlines/microcopy/OCT1-FINAL.md); do not reword
// without product sign-off.
const bullets = [
  'Log planting, spraying, fertilizer, harvest, and hay by field',
  'Import FSA tracts when you have them — or add fields by hand and finish CLUs later',
  'Export FSA-578, spray audit, fall production, hay, fertilizer, and landlord summaries',
];

/**
 * Thin public landing page for signed-out visitors (ticket C, Oct 1 launch).
 * The app itself stays behind /auth; CTAs deep-link into each auth mode and
 * /privacy remains publicly readable.
 */
const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-[env(safe-area-inset-bottom,0px)]">
        <header className="flex items-center justify-between py-4">
          <Logo />
          <Link
            to="/privacy"
            className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            Privacy
          </Link>
        </header>

        <main className="flex flex-1 flex-col">
          <section className="flex flex-col items-center py-12 text-center sm:py-16">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Keep field work and FSA paperwork in one place
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              AcreLedger helps row-crop operators log field work, track grain and
              hay, and build FSA and spray reports from the same records.
              Mobile-friendly. Built for how you already talk about fields.
            </p>
            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg" className="h-11 w-full sm:w-auto">
                <Link to="/auth?mode=signup">Create account</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 w-full sm:w-auto"
              >
                <Link to="/auth?mode=signin">Sign in</Link>
              </Button>
            </div>
          </section>

          <section className="mx-auto w-full max-w-xl pb-12">
            <ul className="space-y-3">
              {bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check size={14} className="text-primary" />
                  </div>
                  <span className="text-sm leading-relaxed text-foreground">
                    {bullet}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </main>

        <footer className="space-y-3 border-t border-border py-6 text-center">
          <p className="mx-auto max-w-xl text-xs leading-relaxed text-muted-foreground">
            Working documents for your records and appointments &mdash; not a
            guarantee of FSA acceptance. Follow labels and your county office.
          </p>
          <div>
            <Link
              to="/privacy"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              Privacy policy
            </Link>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">
              &copy; 2026 AcreLedger
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Landing;
