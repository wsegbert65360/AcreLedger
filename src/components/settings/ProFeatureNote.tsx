import { PlanUpgradeLink } from '@/components/settings/PlanUpgradeLink';

/**
 * A short "this is part of Pro" note with the plan link, shown on screens the
 * server gates (equipment, grain bins) so a free farm learns that before it
 * saves, not afterwards from a parked sync change. Same look as the cattle
 * CSV note. Wording lives in src/copy/entitlements.ts.
 */
export function ProFeatureNote({ title, body, testId }: { title: string; body?: string; testId?: string }) {
  return (
    <div className="space-y-1 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm" data-testid={testId}>
      <p className="font-semibold">{title}</p>
      {body && <p className="text-muted-foreground">{body}</p>}
      <PlanUpgradeLink />
    </div>
  );
}
