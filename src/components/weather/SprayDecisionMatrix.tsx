import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { evaluateSprayConditions, type SprayStatus } from '@/lib/weatherHelpers';

interface SprayDecisionMatrixProps {
  tempF: number;
  humidity: number;
  windSpeed: number;
  windDirection?: string;
  precipProb: number;
  className?: string;
}

const STATUS_CONFIG: Record<SprayStatus, { label: string; color: string; bg: string; border: string; dot: string; icon: React.ElementType; subtext: string }> = {
  go: {
    label: 'Go',
    color: 'text-green-800 dark:text-green-300',
    bg: 'bg-green-500/10',
    border: 'border-green-600/30',
    dot: 'bg-green-600 dark:bg-green-400',
    icon: CheckCircle2,
    subtext: 'Conditions are favorable for spraying.'
  },
  caution: {
    label: 'Caution',
    color: 'text-amber-800 dark:text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-600/40',
    dot: 'bg-amber-500 dark:bg-amber-400',
    icon: AlertTriangle,
    subtext: 'Check the flagged items before spraying.'
  },
  wait: {
    label: 'Wait',
    color: 'text-red-800 dark:text-red-300',
    bg: 'bg-red-500/10',
    border: 'border-red-600/40',
    dot: 'bg-red-600 dark:bg-red-400',
    icon: XCircle,
    subtext: 'Delay spraying until conditions improve.'
  }
};

/** Short labels so four readings fit across a phone. */
const SHORT_LABEL: Record<string, string> = {
  'Wind Speed': 'Wind',
  'Rain Chance': 'Rain',
};

export function SprayDecisionMatrix({
  tempF,
  humidity,
  windSpeed,
  windDirection,
  precipProb,
  className
}: SprayDecisionMatrixProps) {
  const { overall, factors } = evaluateSprayConditions({ tempF, humidity, windSpeed, precipProb });
  const status = STATUS_CONFIG[overall];
  const StatusIcon = status.icon;
  const flagged = factors.filter(factor => factor.status !== 'go');

  return (
    <section className={cn('overflow-hidden rounded-2xl border bg-card', status.border, className)}>
      {/* Verdict */}
      <div className={cn('flex items-center gap-3 px-4 py-3', status.bg)}>
        <StatusIcon size={28} className={cn('shrink-0', status.color)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className={cn('text-base font-bold leading-tight', status.color)}>
            Spray conditions: {status.label}
          </h3>
          <p className="mt-0.5 text-xs text-foreground/80">{status.subtext}</p>
        </div>
        {windDirection && windDirection !== '—' && (
          <div className="shrink-0 text-right">
            <div className="text-xs text-muted-foreground">Wind from</div>
            <div className="font-mono text-sm font-bold text-foreground">{windDirection}</div>
          </div>
        )}
      </div>

      {/* The four readings, each with its own status */}
      <dl className="grid grid-cols-4 divide-x divide-border/60 border-t border-border/60">
        {factors.map((factor) => {
          const factorStatus = STATUS_CONFIG[factor.status];
          return (
            <div key={factor.label} className="flex min-w-0 flex-col items-center px-1 py-2.5 text-center">
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', factorStatus.dot)} aria-hidden="true" />
                <span className="truncate">{SHORT_LABEL[factor.label] ?? factor.label}</span>
              </dt>
              <dd className={cn('mt-0.5 font-mono text-base font-bold', factor.status === 'go' ? 'text-foreground' : factorStatus.color)}>
                {factor.value}
                <span className="sr-only">, {factorStatus.label}</span>
              </dd>
            </div>
          );
        })}
      </dl>

      {/* Only the readings that need attention get an explanation */}
      {flagged.length > 0 && (
        <ul className="space-y-1.5 border-t border-border/60 px-4 py-2.5">
          {flagged.map((factor) => {
            const Icon = factor.icon;
            const factorStatus = STATUS_CONFIG[factor.status];
            return (
              <li key={factor.label} className={cn('flex items-start gap-2 text-sm leading-snug', factorStatus.color)}>
                <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{factor.note}</span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="border-t border-border/40 px-4 py-2 text-xs leading-snug text-muted-foreground">
        Delta-T is estimated from temperature and humidity. Advisory only: follow the label and local regulations.
      </p>
    </section>
  );
}
