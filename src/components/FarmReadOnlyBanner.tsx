import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { isBillingUiAvailable } from '@/lib/billing';
import { READ_ONLY_MESSAGE } from '@/lib/farmAccess';
import * as native from '@/lib/native';
import { useFarm } from '@/store/farmStore';

/**
 * Persistent notice while the farm is view-only. The native app is a free
 * companion (App Review 3.1.3(f)): it states the view-only fact only, with no
 * trial, subscription, price, or purchase wording.
 */
export default function FarmReadOnlyBanner() {
  const { farmAccess } = useFarm();
  if (!farmAccess.readOnly) return null;

  const isNative = native.isNativePlatform();
  const cause = farmAccess.reason === 'subscription-ended'
    ? 'Your AcreLedger subscription has ended.'
    : 'Your free trial has ended.';
  const canSubscribe = !isNative && isBillingUiAvailable();

  return (
    <aside aria-label="View-only farm" className="mx-auto max-w-lg px-4 py-3 lg:max-w-5xl lg:px-8 print:hidden">
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-harvest/30 bg-harvest/10 p-4 text-foreground">
        <p className="flex-1 text-sm">
          {!isNative && <>{cause} </>}
          {READ_ONLY_MESSAGE}
        </p>
        {canSubscribe && (
          <Button asChild className="min-h-11">
            <Link to="/settings?section=billing">Subscribe</Link>
          </Button>
        )}
      </div>
    </aside>
  );
}
