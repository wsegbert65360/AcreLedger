import { type ReactNode } from 'react';
import { AlertTriangle, CircleAlert, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WIND_ALERT_MPH } from '@/lib/weatherHelpers';
import { formatIsoDate } from '@/utils/dates';

const EMPTY_VALUE = '\u2014';

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

function fmtDate(d?: string): string {
  return d ? formatIsoDate(d) : '—';
}

interface AuditDetailProps {
  label: string;
  children: ReactNode;
  className?: string;
}

function AuditDetail({ label, children, className }: AuditDetailProps) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 break-words font-mono text-sm text-foreground', className)}>
        {children}
      </dd>
    </div>
  );
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
    <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Pesticide Application Record</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Private applicator license compliance audit trail. Generated {reportDate}.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex print:hidden">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-11 rounded-lg border-spray/30 font-mono text-xs text-spray hover:bg-spray/10"
            onClick={onExportCsv}
          >
            <Download size={12} className="mr-1.5" />
            CSV
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-11 rounded-lg border-primary/30 font-mono text-xs text-primary hover:bg-primary/10"
            onClick={onExportPdf}
          >
            <Download size={12} className="mr-1.5" />
            PDF
          </Button>
        </div>

        {sprayRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            No spray records to report
          </p>
        ) : (
          <div className="space-y-3">
            {sprayRows.map(r => (
              <article key={r._rowKey} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <h3 className="text-base font-bold tracking-tight text-foreground">{r.fieldName}</h3>
                  <time className="break-words font-mono text-xs leading-relaxed text-muted-foreground sm:text-right">
                    {r.sprayDate ? fmtDate(r.sprayDate) : fmt(r.timestamp)}
                    {r.startTime ? ` at ${r.startTime}${r.endTime ? '-' + r.endTime : ''}` : ''}
                  </time>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-4">
                  <AuditDetail label="Crop / site" className="font-bold text-harvest">
                    {r.cropOrSiteTreated || EMPTY_VALUE}
                  </AuditDetail>
                  <AuditDetail label="Target pest" className="font-bold">
                    {r.targetPest || EMPTY_VALUE}
                  </AuditDetail>
                  <AuditDetail label="Product" className="font-bold text-spray">
                    {r.product}
                  </AuditDetail>
                  <AuditDetail label="EPA registration">
                    {r.epaRegNumber || EMPTY_VALUE}
                  </AuditDetail>
                  <AuditDetail label="Rate per acre">
                    {r.applicationRate != null ? `${r.applicationRate} ${r.rateUnit || ''}`.trim() : EMPTY_VALUE}
                  </AuditDetail>
                  <AuditDetail label="Acres treated" className="font-bold">
                    {r.treatedAreaSize != null ? r.treatedAreaSize : EMPTY_VALUE}
                  </AuditDetail>
                  <AuditDetail label="Total product" className="font-bold">
                    {r.amountDisplay}
                  </AuditDetail>
                  <AuditDetail label="Equipment">
                    {r.equipmentId || EMPTY_VALUE}
                  </AuditDetail>
                  <div className="col-span-2 mt-1 grid grid-cols-2 gap-4 border-t border-border/60 pt-3">
                    <AuditDetail label="Applicator">{r.applicatorName || EMPTY_VALUE}</AuditDetail>
                    <AuditDetail label="License">{r.licenseNumber || EMPTY_VALUE}</AuditDetail>
                  </div>
                  <div className="col-span-2 grid grid-cols-3 gap-3 border-t border-border/60 pt-3">
                    <AuditDetail label="Wind">{r.windSpeed} mph {r.windDirection || ''}</AuditDetail>
                    <AuditDetail label="Temp">
                      {r.temperature != null ? `${r.temperature}\u00B0F` : EMPTY_VALUE}
                    </AuditDetail>
                    <AuditDetail label="Humidity">
                      {r.relativeHumidity != null ? `${r.relativeHumidity}%` : EMPTY_VALUE}
                    </AuditDetail>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2 print:hidden">
                  {r.windSpeed > WIND_ALERT_MPH && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Wind alert
                    </span>
                  )}
                  {!r.epaRegNumber && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                      <CircleAlert className="h-3.5 w-3.5" />
                      Missing EPA registration
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
    </section>
  );
}
