import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ENTITLEMENT_COPY, freePlanIncluded, paidPlanAdds, planDisplayName } from '@/copy/entitlements';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useIosUpgradeLink } from '@/hooks/useIosUpgradeLink';
import { isBillingUiAvailable } from '@/lib/billing';
import { isFreeTierLocked } from '@/lib/entitlements';

/**
 * Display-only plan summary. Renders nothing until the server is enforcing
 * (ENTITLEMENTS_MODE = enforce), so `off` and `shadow` look exactly like today.
 * On iOS there is no purchase flow. A website link appears only on the US App Store storefront
 * (docs/ios-storefront-link.md); otherwise only a neutral pointer to the website.
 */
export default function PlanCard() {
  const { entitlement } = useEntitlement();
  // iOS: a website link only on the US storefront (fails closed); never an in-app checkout.
  const iosLink = useIosUpgradeLink();
  if (!entitlement || !entitlement.enforced) return null;

  const free = isFreeTierLocked(entitlement);
  const canLinkToBilling = isBillingUiAvailable();

  return (
    <Card className="border-border/30" data-testid="plan-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-foreground text-lg">
          <span className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            {ENTITLEMENT_COPY.planCardTitle}
          </span>
          <Badge variant="outline" className="rounded-full font-medium">
            {planDisplayName(entitlement.plan)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {free ? (
          <>
            <p className="text-foreground">{ENTITLEMENT_COPY.planFreeSummary}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              {freePlanIncluded().map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p className="font-medium text-foreground"></p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              {paidPlanAdds().map((line) => <li key={line}>{line}</li>)}
            </ul>
            {canLinkToBilling ? (
              <Link
                to="/settings?section=billing"
                className="inline-block font-medium text-primary underline underline-offset-2"
              >
                {ENTITLEMENT_COPY.planUpgradeLink}
              </Link>
            ) : iosLink.url ? (
              <button
                type="button"
                onClick={iosLink.open}
                className="inline-block font-medium text-primary underline underline-offset-2"
              >
                {ENTITLEMENT_COPY.planUpgradeLinkWebsite}
              </button>
            ) : (
              <p className="text-muted-foreground">{ENTITLEMENT_COPY.nativeManageOnWeb}</p>
            )}
          </>
        ) : (
          <p className="text-foreground">Full access to every feature.</p>
        )}
        <p className="text-xs text-muted-foreground">{ENTITLEMENT_COPY.planNothingDeleted}</p>
      </CardContent>
    </Card>
  );
}
