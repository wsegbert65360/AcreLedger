import { Link, useNavigate } from 'react-router-dom';

import { ArrowLeft, LifeBuoy, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SUPPORT_EMAIL = 'support@acreledger.com';

/**
 * Public support/contact page for signed-out visitors (Oct 1 launch).
 * App Store support URLs can point here on the live Vercel host while
 * acreledger.com stays parked.
 */
export default function Support() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="mx-auto max-w-2xl space-y-6 p-4 lg:max-w-4xl lg:px-8">
        <header className="flex items-center gap-4 py-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-muted-foreground"
          >
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Support</h1>
        </header>

        <Card className="border-border/40 bg-card/50 shadow-xl backdrop-blur-sm">
          <CardHeader className="border-b border-border/10 pb-6">
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <LifeBuoy className="text-primary" size={24} />
              </div>
              <div>
                <CardTitle className="text-xl">AcreLedger Support</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Last updated: September 11, 2026</p>
              </div>
            </div>
            <p className="mt-4 text-sm italic leading-relaxed text-muted-foreground">
              Questions about the farm book, your account, or App Store listings go here.
              This page is public so you can reach us without signing in.
            </p>
          </CardHeader>
          <CardContent className="space-y-8 pt-8 font-mono">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <Mail size={18} />
                <h2 className="text-lg font-bold">Email</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Write to{' '}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-bold text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
                . We read every message and reply as soon as we can.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-bold text-foreground">Account deletion</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Sign in, open Settings, then Account &amp; Display, and choose Delete Account.
                Type DELETE to confirm. Requests are recorded and completed within 30 days.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-bold text-foreground">Privacy</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                How farm records are stored and isolated is described in the{' '}
                <Link
                  to="/privacy"
                  className="font-bold text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  privacy policy
                </Link>
                .
              </p>
            </section>
          </CardContent>
        </Card>

        <footer className="py-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
            &copy; 2026 AcreLedger Precision Agriculture.
          </p>
        </footer>
      </div>
    </div>
  );
}
