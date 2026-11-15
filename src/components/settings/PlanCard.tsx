import { Sparkles } from 'lucide-react';

import { PlanUpgradeLink } from '@/components/settings/PlanUpgradeLink';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ENTITLEMENT_COPY, freePlanIncluded, paidPlanAdds, planDisplayName } from '@/copy/entitlements';
import { useEntitlement } from '@/hooks/useEntitlement';
import { isFreeTierLocked } from '@/lib/entitlements';

/**
 * Display-only plan summary. Renders nothing until the server is enforcing
 * (ENTITLEMENTS_MODE = enforce), so `off` and `shadow` look exactly like today.
 * On iOS there is no purchase flow. A website link appears only on the US App Store storefront
 * (docs/ios-storefront-link.md); otherwise only a neutral pointer to the website.
 */
export default function PlanCard() {
  const { entitlement } = useEntitlement();
  if (!entitlement || !entitlement.enforced) return null;

  const free = isFreeTierLocked(entitlement);

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
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              {paidPlanAdds().map((line) => <li key={line}>{line}</li>)}
            </ul>
            <PlanUpgradeLink />
          </>
        ) : (
          <p className="text-foreground">Full access to every feature.</p>
        )}
        <p className="text-xs text-muted-foreground">{ENTITLEMENT_COPY.planNothingDeleted}</p>
      </CardContent>
    </Card>
  );
}
