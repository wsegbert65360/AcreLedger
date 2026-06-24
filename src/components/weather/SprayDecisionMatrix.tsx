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

const STATUS_CONFIG: Record<SprayStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType; subtext: string }> = {
  go: {
    label: 'GO',
    color: 'text-green-600',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    icon: CheckCircle2,
    subtext: 'Conditions are favorable for spraying.'
  },
  caution: {
    label: 'CAUTION',
    color: 'text-yellow-600',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    icon: AlertTriangle,
    subtext: 'Check specific factors before spraying.'
  },
  wait: {
    label: 'WAIT',
    color: 'text-red-600',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: XCircle,
    subtext: 'Delay spraying until conditions improve.'
  }
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

  return (
    <div className={cn('rounded-2xl border bg-card overflow-hidden', status.border, className)}>
      <div className={cn('px-4 py-3 border-b flex items-center justify-between', status.bg, status.border)}>
        <div className="flex items-center gap-2">
          <StatusIcon size={20} className={status.color} />
          <div>
            <h3 className={cn('text-sm font-bold uppercase tracking-wider', status.color)}>
              Spray Conditions: {status.label}
            </h3>
            <p className={cn('text-[10px] font-medium', status.color, 'opacity-80')}>
              {status.subtext}
            </p>
          </div>
        </div>
        {windDirection && windDirection !== '—' && (
          <div className="text-right">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">Wind Dir</div>
            <div className={cn('text-xs font-mono font-bold', status.color)}>{windDirection}</div>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        {factors.map((factor) => {
          const Icon = factor.icon;
          const factorStatus = STATUS_CONFIG[factor.status];
          return (
            <div
              key={factor.label}
              className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 p-2"
            >
              <div className={cn('mt-0.5', factorStatus.color)}>
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase">
                    {factor.label}
                  </span>
                  <span className={cn('text-[11px] font-mono font-bold', factorStatus.color)}>
                    {factor.value}
                  </span>
                </div>
                <p className={cn('text-[10px] leading-tight mt-0.5', factorStatus.color, 'opacity-90')}>
                  {factor.note}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2 border-t border-border/30 bg-muted/10">
        <p className="text-[9px] text-muted-foreground/70 leading-tight">
          Delta-T (ΔT) is an estimate based on temperature and humidity. Always follow label directions and local regulations; this guidance is advisory only.
        </p>
      </div>
    </div>
  );
}
