import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatIsoDate } from '@/utils/dates';

const WIND_ALERT_MPH = 10;

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

function fmtDate(d?: string): string {
  return d ? formatIsoDate(d) : '—';
}

interface SprayAuditRow {
  _rowKey: string;
  fieldName: string;
  sprayDate?: string;
  timestamp: number;
  startTime?: string;
  endTime?: string;
  cropOrSiteTreated?: string;
  targetPest?: string;
  product: string;
  epaRegNumber?: string;
  applicationRate?: number;
  rateUnit?: string;
  treatedAreaSize?: number;
  amountDisplay: string;
  equipmentId?: string;
  applicatorName?: string;
  licenseNumber?: string;
  windSpeed: number;
  windDirection?: string;
  temperature?: number;
  relativeHumidity?: number;
}

interface SprayAuditReportProps {
  sprayRows: SprayAuditRow[];
  reportDate: string;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

export default function SprayAuditReport({
  sprayRows,
  reportDate,
  onExportCsv,
  onExportPdf,
}: SprayAuditReportProps) {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 print:border-foreground/20">
        <h2 className="font-bold text-foreground text-base mb-1">Pesticide Application Record</h2>
        <p className="text-xs text-muted-foreground mb-1">
          Private applicator license compliance audit trail. Generated {reportDate}.
        </p>

        <div className="flex gap-2 pb-4 print:hidden">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[11px] font-mono border-spray/30 text-spray hover:bg-spray/10"
            onClick={onExportCsv}
          >
            <Download size={12} className="mr-1.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[11px] font-mono border-primary/30 text-primary hover:bg-primary/10"
            onClick={onExportPdf}
          >
            <Download size={12} className="mr-1.5" />
            PDF
          </Button>
        </div>

        {sprayRows.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">
            No spray records to report
          </p>
        ) : (
          <div className="space-y-4">
            {sprayRows.map(r => (
              <div key={r._rowKey} className="border border-border/50 rounded-lg p-3 space-y-2 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-spray opacity-50" />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground text-sm tracking-tight">{r.fieldName}</span>
                  <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {fmtDate(r.sprayDate) || fmt(r.timestamp)}{r.startTime ? ` @ ${r.startTime}${r.endTime ? '-' + r.endTime : ''}` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                  <div><span className="text-muted-foreground uppercase text-[11px]">Crop / Site:</span><div className="text-harvest font-bold">{r.cropOrSiteTreated || '—'}</div></div>
                  <div><span className="text-muted-foreground uppercase text-[11px]">Target Pest:</span> <span className="text-foreground font-bold">{r.targetPest || '—'}</span></div>
                  <div><span className="text-muted-foreground uppercase text-[11px]">Product:</span><div className="text-spray font-bold">{r.product}</div></div>
                  <div><span className="text-muted-foreground uppercase text-[11px]">EPA Reg #:</span><div className="text-foreground">{r.epaRegNumber || '—'}</div></div>
                  <div><span className="text-muted-foreground uppercase text-[11px]">Rate / Ac:</span><div className="text-foreground">{r.applicationRate ? `${r.applicationRate} ${r.rateUnit || ''}` : '—'}</div></div>
                  <div><span className="text-muted-foreground uppercase text-[11px]">Total Acres Treated:</span><div className="text-foreground font-bold">{r.treatedAreaSize || '—'}</div></div>
                  <div><span className="text-muted-foreground uppercase text-[11px]">Total Product:</span><div className="text-foreground font-bold">{r.amountDisplay}</div></div>
                  <div><span className="text-muted-foreground uppercase text-[11px]">Equipment:</span><div className="text-foreground">{r.equipmentId || '—'}</div></div>
                  <div className="col-span-2 pt-1 border-t border-border/30 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <div><span className="text-muted-foreground uppercase text-[11px]">Applicator:</span> <span className="text-foreground/80">{r.applicatorName || '—'}</span></div>
                    <div><span className="text-muted-foreground uppercase text-[11px]">License:</span> <span className="text-foreground/80">{r.licenseNumber || '—'}</span></div>
                  </div>
                  <div className="col-span-2 pt-1 flex flex-wrap gap-x-4 text-[11px] opacity-80">
                    <div><span className="text-muted-foreground uppercase text-[11px]">Wind:</span> <span className="text-foreground">{r.windSpeed} mph {r.windDirection || ''}</span></div>
                    <div><span className="text-muted-foreground uppercase text-[11px]">Temp:</span> <span className="text-foreground">{r.temperature}°F</span></div>
                    <div><span className="text-muted-foreground uppercase text-[11px]">Hum:</span> <span className="text-foreground">{r.relativeHumidity != null ? `${r.relativeHumidity}%` : '—'}</span></div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap pt-1 print:hidden">
                  {r.windSpeed > WIND_ALERT_MPH && (
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      ⚠ WIND ALERT
                    </span>
                  )}
                  {!r.epaRegNumber && (
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">
                      NON-COMPLIANT: NO EPA #
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
