import { AlertTriangle, CheckCircle2, CloudRain, Clock, MapPin, User, Wind } from 'lucide-react';
import { SprayRecipeProduct } from '@/types/farm';
import { WeatherData } from '@/types/weather';

interface SprayWizardReviewStepProps {
  fieldName: string;
  seasonYear: number;
  isExisting: boolean;
  sprayDate: string;
  startTime: string;
  endTime: string;
  applicatorName: string;
  licenseNumber: string;
  equipmentId: string;
  targetPest: string;
  cropOrSiteTreated: string;
  applicationMethod: string;
  treatedAreaSize: string;
  treatedAreaUnit: string;
  products: SprayRecipeProduct[];
  weather: WeatherData | null;
  manualWindDirection: string;
  manualWindSpeed: string;
  isFullyCompliant: boolean;
  missingComplianceFields: string[];
}

function ReviewRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-[11px] font-mono text-muted-foreground uppercase flex items-center gap-1.5">
        {Icon && <Icon size={12} />}
        {label}
      </span>
      <span className="text-xs font-mono font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}

export function SprayWizardReviewStep(props: SprayWizardReviewStepProps) {
  const {
    fieldName, seasonYear, isExisting,
    sprayDate, startTime, endTime,
    applicatorName, licenseNumber, equipmentId,
    targetPest, cropOrSiteTreated, applicationMethod,
    treatedAreaSize, treatedAreaUnit,
    products, weather, manualWindDirection, manualWindSpeed,
    isFullyCompliant, missingComplianceFields
  } = props;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-spray font-bold">
          <CloudRain size={18} />
          <span>{isExisting ? 'Update' : 'Save'} Spray Record</span>
        </div>
        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-spray/10 text-spray border border-spray/20">
          {seasonYear} Season
        </span>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1">
        <ReviewRow label="Field" value={fieldName} icon={MapPin} />
        <ReviewRow label="Date" value={sprayDate || '—'} icon={Clock} />
        <ReviewRow label="Time" value={`${startTime || '—'} – ${endTime || '—'}`} />
        <ReviewRow label="Applicator" value={applicatorName || '—'} icon={User} />
        <ReviewRow label="License" value={licenseNumber || '—'} />
        <ReviewRow label="Equipment" value={equipmentId || '—'} />
        <ReviewRow label="Crop / Site" value={cropOrSiteTreated || '—'} />
        <ReviewRow label="Application Method" value={applicationMethod || '—'} />
        <ReviewRow label="Target Pest" value={targetPest || '—'} />
        <ReviewRow label="Treated Area" value={`${treatedAreaSize || '—'} ${treatedAreaUnit}`} />
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
        <div className="text-[11px] font-mono text-muted-foreground uppercase font-bold">Chemical Mix</div>
        {products.filter(p => p.product.trim()).map((p, i) => (
          <div key={p.ui_id || i} className="text-xs font-mono space-y-0.5">
            <div className="font-bold text-foreground">{p.product}</div>
            <div className="text-muted-foreground">
              {p.rate} {p.rateUnit} &middot; EPA {p.epaRegNumber || '—'} &middot; Total {p.totalProductAmount || '—'} {p.totalProductUnit}
            </div>
          </div>
        ))}
        {!products.some(p => p.product.trim()) && (
          <div className="text-xs font-mono text-destructive">No products entered.</div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1">
        <div className="text-[11px] font-mono text-muted-foreground uppercase font-bold flex items-center gap-1.5">
          <Wind size={12} /> Conditions
        </div>
        <ReviewRow label="Wind" value={`${manualWindSpeed || '—'} mph ${manualWindDirection || ''}`} />
        <ReviewRow label="Temperature" value={weather ? `${weather.temp}°F` : '—'} />
        <ReviewRow label="Humidity" value={weather ? `${weather.humidity}%` : '—'} />
      </div>

      {isFullyCompliant ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-green-600">
          <CheckCircle2 size={16} />
          <span className="text-xs font-mono font-bold">All required compliance fields are complete.</span>
        </div>
      ) : (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 space-y-1">
          <div className="flex items-center gap-2 text-yellow-500 font-mono text-xs font-bold uppercase tracking-wider">
            <AlertTriangle size={14} />
            Record will be saved as incomplete
          </div>
          <p className="text-[11px] text-yellow-600/80 leading-relaxed">
            The following compliance fields are missing. You can complete them later by editing this record.
          </p>
          <ul className="mt-1 space-y-0.5">
            {missingComplianceFields.map(f => (
              <li key={f} className="text-[11px] font-mono text-yellow-600/90">· {f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
