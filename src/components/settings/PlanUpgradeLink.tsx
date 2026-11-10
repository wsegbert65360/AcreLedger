import { Link } from 'react-router-dom';

import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { useIosUpgradeLink } from '@/hooks/useIosUpgradeLink';
import { isBillingUiAvailable } from '@/lib/billing';

const linkClass = 'inline-block font-medium text-primary underline underline-offset-2';

/**
 * See Pro. Web shows the billing link when that UI is on. iOS shows a website
 * button only on the US App Store storefront. Everywhere else, a sentence and no link.
 */
export function PlanUpgradeLink() {
  const iosLink = useIosUpgradeLink();
  if (isBillingUiAvailable()) {
    return (
      <Link to="/settings?section=billing" className={linkClass}>
        {ENTITLEMENT_COPY.planUpgradeLink}
      </Link>
    );
  }
  if (iosLink.url) {
    return (
      <button type="button" onClick={iosLink.open} className={linkClass}>
        {ENTITLEMENT_COPY.planUpgradeLinkWebsite}
      </button>
    );
  }
  return <p className="text-muted-foreground">{ENTITLEMENT_COPY.nativeManageOnWeb}</p>;
}
