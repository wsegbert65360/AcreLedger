import ReportTable from '@/components/ReportTable';
import type { InsuranceProductionReport as InsuranceReport } from '@/lib/complianceReports/insuranceProduction';
import { INSURANCE_PRODUCTION_DISCLAIMER, INSURANCE_PRODUCTION_TITLE } from '@/lib/complianceReports/insuranceProductionExport';
import type { ReportReadinessIssue, ReportReadinessSummary } from '@/lib/reportReadiness';
import type { ReportExportStatus } from '@/lib/reportExportHistory';
import { farmNameForProse, farmNameScreenLabel } from '@/lib/farmDisplayName';
import { MobileReportExportPanel } from './MobileReportExportPanel';

interface InsuranceProductionReportProps {
  report: InsuranceReport;
  readinessSummary: ReportReadinessSummary;
  onIssueAction?: (issue: ReportReadinessIssue) => void;
  exportStatus?: ReportExportStatus;
  farmName: string | null;
  viewingSeason: number;
  reportDate: string;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

const HEADERS = ['COUNTY', 'CROP', 'PRACTICE', 'PLANTED AC', 'HARVESTED AC', 'PRODUCTION BU', 'SOLD BU', 'STORED BU', 'YIELD BU/AC'];

function n(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function y(value: number | null): string {
  return value == null ? '-' : value.toFixed(1);
}

export default function InsuranceProductionReport({
  report,
  readinessSummary,
  onIssueAction,
  exportStatus,
  farmName,
  viewingSeason,
  reportDate,
  onExportCsv,
  onExportPdf,
}: InsuranceProductionReportProps) {
  const cell = 'px-3 py-2 font-mono text-xs text-foreground';
  return (
    <>
      <MobileReportExportPanel
        title="Insurance production worksheet"
        description={`Review ${viewingSeason} production by unit for ${farmNameForProse(farmName)}, then send the worksheet to your crop insurance agent.`}
        summary={readinessSummary}
        itemLabel="units"
        onExportPdf={onExportPdf}
        onExportData={onExportCsv}
        onIssueAction={onIssueAction}
        exportStatus={exportStatus}
      />
      <div className="hidden lg:block print:block">
        <ReportTable
          title={INSURANCE_PRODUCTION_TITLE}
          subtitle={`Farm: ${farmNameScreenLabel(farmName)} | Crop Year: ${viewingSeason} | Generated ${reportDate}.`}
          headers={HEADERS}
          onExport={onExportCsv}
          onExportPdf={onExportPdf}
          exportLabel="CSV"
          summary={(
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">{INSURANCE_PRODUCTION_DISCLAIMER} Enterprise units: one unit per crop per county.</p>
              {report.units.some(unit => unit.farms.length > 0) && (
                <div className="border-t pt-3">
                  <h3 className="mb-2 font-bold">Yield by FSA farm number</h3>
                  <div className="space-y-1 font-mono text-xs">
                    {report.units.flatMap(unit => unit.farms.map(farm => (
                      <div key={`${unit.key}-${farm.farmNumber}`} className="flex justify-between gap-3">
                        <span>
                          {unit.crop} · {unit.county} · {farm.farmNumber ? `Farm ${farm.farmNumber}` : 'No FSA farm'}
                          {farm.tracts.length > 0 && <span className="text-muted-foreground"> (tracts {farm.tracts.join(', ')})</span>}
                        </span>
                        <span className="whitespace-nowrap font-bold text-harvest">
                          {n(farm.production)} bu / {n(farm.plantedAcres)} ac = {y(farm.yield)} bu/ac
                        </span>
                      </div>
                    )))}
                  </div>
                </div>
              )}
              {report.units.some(unit => unit.estimated) && (
                <p className="text-xs text-muted-foreground">
                  Some fields lie in more than one county; their acres and bushels are divided by each county&apos;s share of the field&apos;s mapped acres.
                </p>
              )}
            </div>
          )}
        >
          {report.units.map(unit => (
            <tr key={unit.key} className="hover:bg-muted/30 transition-colors">
              <td data-label="COUNTY" className={cell}>{unit.county}</td>
              <td data-label="CROP" className={`${cell} font-bold text-harvest`}>{unit.crop}</td>
              <td data-label="PRACTICE" className={cell}>{unit.practices.map(p => p.practice).join(' + ') || '-'}</td>
              <td data-label="PLANTED AC" className={`${cell} text-right`}>{n(unit.plantedAcres)}</td>
              <td data-label="HARVESTED AC" className={`${cell} text-right`}>{n(unit.harvestedAcres)}</td>
              <td data-label="PRODUCTION BU" className={`${cell} text-right`}>{n(unit.production)}</td>
              <td data-label="SOLD BU" className={`${cell} text-right`}>{n(unit.soldBushels)}</td>
              <td data-label="STORED BU" className={`${cell} text-right`}>{n(unit.storedBushels)}</td>
              <td data-label="YIELD BU/AC" className={`${cell} text-right font-bold`}>{y(unit.yield)}</td>
            </tr>
          ))}
          {report.units.length === 0 && (
            <tr className="full-width-row">
              <td colSpan={HEADERS.length} className="py-12 text-center text-muted-foreground text-xs">
                No planting or harvest records to report for this season
              </td>
            </tr>
          )}
          {report.issues.length > 0 && (
            <tr className="full-width-row print:hidden">
              <td colSpan={HEADERS.length} className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                <div className="font-bold uppercase tracking-wide mb-1">Items to check: {report.issues.length}</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {report.issues.slice(0, 8).map(issue => <li key={issue.id}>{issue.message}</li>)}
                  {report.issues.length > 8 && <li>{report.issues.length - 8} more</li>}
                </ul>
              </td>
            </tr>
          )}
        </ReportTable>
      </div>
    </>
  );
}
