export type ReportReadinessStatus = 'ready' | 'review' | 'empty';

export type ReportIssueSeverity = 'error' | 'warning' | 'info';

export interface ReportReadinessIssue {
  id: string;
  severity: ReportIssueSeverity;
  category: string;
  message: string;
  itemId?: string;
  fieldId?: string;
  recordId?: string;
  recordType?: string;
  actionLabel?: string;
}

export interface ReportReadinessSummary {
  status: ReportReadinessStatus;
  totalItems: number;
  readyItems: number;
  affectedItems: number;
  errors: number;
  warnings: number;
  information: number;
  issues: ReportReadinessIssue[];
}

interface SprayReadinessProduct {
  product: string;
  rate: string;
  epaRegNumber?: string;
}

interface SprayReadinessRecord {
  id: string;
  fieldId: string;
  fieldName: string;
  products?: SprayReadinessProduct[];
  nonCompliant?: boolean;
  applicatorName?: string;
  licenseNumber?: string;
  treatedAreaSize?: number;
  windSpeed: number;
}

interface FertilizerReadinessRecord {
  id: string;
  fieldId: string;
  fieldName: string;
  date: string;
  acres: number;
  fertilizer_formula: string;
}

interface HayReadinessRecord {
  id: string;
  fieldId: string;
  fieldName: string;
  date: string;
  baleCount: number;
  cuttingNumber: number;
}

interface LandlordReadinessSummary {
  fields: Array<{ fieldId: string; fieldName: string; acres: number }>;
  activity: Array<{ fieldName: string }>;
}

interface LandlordReadinessHarvest {
  id: string;
  fieldId: string;
  fieldName: string;
  landlordSplitPercent?: number;
}

interface FsaReadinessRow {
  id: string;
  fieldId?: string;
  fieldName: string;
  recordType?: 'grain' | 'hay';
}

interface FsaReadinessValidationIssue {
  rowId: string;
  severity: 'warning' | 'error';
  field: string;
  message: string;
}

interface BuildReportReadinessSummaryInput {
  totalItems: number;
  issues: ReportReadinessIssue[];
  /**
   * Optional authoritative count for reports whose readiness unit cannot be
   * inferred from issue item IDs (for example, expanded CLU report rows).
   */
  readyItems?: number;
}

export function buildReportReadinessSummary({
  totalItems,
  issues,
  readyItems,
}: BuildReportReadinessSummaryInput): ReportReadinessSummary {
  const safeTotalItems = Math.max(0, Math.trunc(totalItems));
  const errors = issues.filter(issue => issue.severity === 'error').length;
  const warnings = issues.filter(issue => issue.severity === 'warning').length;
  const information = issues.filter(issue => issue.severity === 'info').length;
  const affectedItemIds = new Set(
    issues
      .map(issue => issue.itemId ?? issue.fieldId ?? issue.recordId)
      .filter((id): id is string => Boolean(id)),
  );
  const inferredAffectedItems = Math.min(affectedItemIds.size, safeTotalItems);
  const safeReadyItems = readyItems == null
    ? Math.max(0, safeTotalItems - inferredAffectedItems)
    : Math.min(Math.max(0, Math.trunc(readyItems)), safeTotalItems);

  return {
    status: safeTotalItems === 0 ? 'empty' : issues.length > 0 ? 'review' : 'ready',
    totalItems: safeTotalItems,
    readyItems: safeReadyItems,
    affectedItems: Math.max(0, safeTotalItems - safeReadyItems),
    errors,
    warnings,
    information,
    issues,
  };
}

const FSA_578_CATEGORY_BY_FIELD: Record<string, string> = {
  farmNumber: 'Farm, tract, and CLU setup',
  tractNumber: 'Farm, tract, and CLU setup',
  fieldNumber: 'Farm, tract, and CLU setup',
  crop: 'Crop and status',
  cropStatus: 'Crop and status',
  date: 'Planting details',
  intendedUse: 'Planting details',
  producerShare: 'Producer and practice details',
  irrigationCode: 'Producer and practice details',
  acreage: 'Acreage reconciliation',
};

const FALL_FSA_CATEGORY_BY_FIELD: Record<string, string> = {
  farmNumber: 'Farm and tract setup',
  tractNumber: 'Farm and tract setup',
  crop: 'Production details',
  harvestDate: 'Production details',
  production: 'Production details',
  destination: 'Destination and evidence',
  evidenceReference: 'Destination and evidence',
};

export function buildFsa578Readiness(
  rows: FsaReadinessRow[],
  validationIssues: FsaReadinessValidationIssue[],
): ReportReadinessSummary {
  const rowById = new Map(rows.map(row => [row.id, row]));
  const fieldIds = new Set(rows.map(row => row.fieldId ?? row.fieldName));
  const issues = validationIssues.map((issue, index): ReportReadinessIssue => {
    const row = rowById.get(issue.rowId);
    return {
      id: `fsa-578-${issue.rowId}-${issue.field}-${index}`,
      severity: issue.severity,
      category: FSA_578_CATEGORY_BY_FIELD[issue.field] ?? 'Other report details',
      message: issue.message,
      itemId: row?.fieldId ?? row?.fieldName ?? issue.rowId,
      fieldId: row?.fieldId,
      recordId: issue.rowId,
      recordType: 'plant',
      actionLabel: row ? 'Open field' : undefined,
    };
  });

  return buildReportReadinessSummary({ totalItems: fieldIds.size, issues });
}

export function buildFsaFallReadiness(
  rows: FsaReadinessRow[],
  validationIssues: FsaReadinessValidationIssue[],
): ReportReadinessSummary {
  const rowById = new Map(rows.map(row => [row.id, row]));
  const issues = validationIssues.map((issue, index): ReportReadinessIssue => {
    const row = rowById.get(issue.rowId);
    return {
      id: `fsa-fall-${issue.rowId}-${issue.field}-${index}`,
      severity: issue.severity,
      category: FALL_FSA_CATEGORY_BY_FIELD[issue.field] ?? 'Other report details',
      message: issue.message,
      itemId: issue.rowId,
      recordId: issue.rowId,
      recordType: row?.recordType === 'hay' ? 'hay' : 'harvest',
      actionLabel: row ? 'Review record' : undefined,
    };
  });

  return buildReportReadinessSummary({ totalItems: rows.length, issues });
}

export function buildSprayReadiness(
  records: SprayReadinessRecord[],
  windAlertMph: number,
): ReportReadinessSummary {
  const issues: ReportReadinessIssue[] = [];

  for (const record of records) {
    const baseIssue = {
      itemId: record.id,
      fieldId: record.fieldId,
      recordId: record.id,
      recordType: 'spray',
      actionLabel: 'Review spray record',
    } as const;

    if (record.nonCompliant) {
      issues.push({
        ...baseIssue,
        id: `spray-${record.id}-non-compliant`,
        severity: 'error',
        category: 'Compliance review',
        message: `${record.fieldName} is marked non-compliant.`,
      });
    }

    if (!record.products || record.products.length === 0) {
      issues.push({
        ...baseIssue,
        id: `spray-${record.id}-products`,
        severity: 'error',
        category: 'Product details',
        message: `${record.fieldName} has no pesticide product recorded.`,
      });
    } else {
      record.products.forEach((product, productIndex) => {
        const productLabel = product.product.trim() || `Product ${productIndex + 1}`;
        if (!product.epaRegNumber?.trim()) {
          issues.push({
            ...baseIssue,
            id: `spray-${record.id}-epa-${productIndex}`,
            severity: 'error',
            category: 'Product details',
            message: `${record.fieldName}: ${productLabel} is missing an EPA registration number.`,
          });
        }
        if (!product.rate?.trim() || Number(product.rate) <= 0) {
          issues.push({
            ...baseIssue,
            id: `spray-${record.id}-rate-${productIndex}`,
            severity: 'error',
            category: 'Application details',
            message: `${record.fieldName}: ${productLabel} has an invalid application rate.`,
          });
        }
      });
    }

    if (record.treatedAreaSize == null || record.treatedAreaSize <= 0) {
      issues.push({
        ...baseIssue,
        id: `spray-${record.id}-area`,
        severity: 'error',
        category: 'Application details',
        message: `${record.fieldName} is missing a valid treated area.`,
      });
    }
    if (!record.applicatorName?.trim() || !record.licenseNumber?.trim()) {
      issues.push({
        ...baseIssue,
        id: `spray-${record.id}-applicator`,
        severity: 'warning',
        category: 'Applicator details',
        message: `${record.fieldName} is missing applicator or license information.`,
      });
    }
    if (record.windSpeed > windAlertMph) {
      issues.push({
        ...baseIssue,
        id: `spray-${record.id}-wind`,
        severity: 'warning',
        category: 'Weather conditions',
        message: `${record.fieldName} recorded wind at ${record.windSpeed} mph, above the ${windAlertMph} mph review threshold.`,
      });
    }
  }

  return buildReportReadinessSummary({ totalItems: records.length, issues });
}

export function buildFertilizerReadiness(
  records: FertilizerReadinessRecord[],
  activeFieldIds: Set<string>,
): ReportReadinessSummary {
  const issues: ReportReadinessIssue[] = [];
  for (const record of records) {
    const baseIssue = {
      itemId: record.id,
      fieldId: record.fieldId,
      recordId: record.id,
      recordType: 'fertilizer',
      actionLabel: 'Review fertilizer record',
    } as const;
    if (!record.fieldId || !activeFieldIds.has(record.fieldId)) {
      issues.push({ ...baseIssue, id: `fertilizer-${record.id}-field`, severity: 'error', category: 'Field association', message: `${record.fieldName || 'A fertilizer record'} is not linked to an active field.` });
    }
    if (!record.date?.trim()) {
      issues.push({ ...baseIssue, id: `fertilizer-${record.id}-date`, severity: 'error', category: 'Application details', message: `${record.fieldName} is missing an application date.` });
    }
    if (!record.fertilizer_formula?.trim()) {
      issues.push({ ...baseIssue, id: `fertilizer-${record.id}-formula`, severity: 'error', category: 'Application details', message: `${record.fieldName} is missing a fertilizer formula.` });
    }
    if (!Number.isFinite(record.acres) || record.acres <= 0) {
      issues.push({ ...baseIssue, id: `fertilizer-${record.id}-acres`, severity: 'error', category: 'Application details', message: `${record.fieldName} has invalid applied acreage.` });
    }
  }
  return buildReportReadinessSummary({ totalItems: records.length, issues });
}

export function buildHayReadiness(
  records: HayReadinessRecord[],
  activeFieldIds: Set<string>,
): ReportReadinessSummary {
  const issues: ReportReadinessIssue[] = [];
  for (const record of records) {
    const baseIssue = {
      itemId: record.id,
      fieldId: record.fieldId,
      recordId: record.id,
      recordType: 'hay',
      actionLabel: 'Review hay record',
    } as const;
    if (!record.fieldId || !activeFieldIds.has(record.fieldId)) {
      issues.push({ ...baseIssue, id: `hay-${record.id}-field`, severity: 'error', category: 'Field association', message: `${record.fieldName || 'A hay record'} is not linked to an active field.` });
    }
    if (!record.date?.trim()) {
      issues.push({ ...baseIssue, id: `hay-${record.id}-date`, severity: 'error', category: 'Harvest details', message: `${record.fieldName} is missing a harvest date.` });
    }
    if (!Number.isFinite(record.baleCount) || record.baleCount <= 0) {
      issues.push({ ...baseIssue, id: `hay-${record.id}-bales`, severity: 'error', category: 'Harvest details', message: `${record.fieldName} has an invalid bale count.` });
    }
    if (!Number.isInteger(record.cuttingNumber) || record.cuttingNumber <= 0) {
      issues.push({ ...baseIssue, id: `hay-${record.id}-cutting`, severity: 'warning', category: 'Harvest details', message: `${record.fieldName} is missing a valid cutting number.` });
    }
  }
  return buildReportReadinessSummary({ totalItems: records.length, issues });
}

export function buildLandlordReadiness(
  summary: LandlordReadinessSummary | null,
  harvestRecords: LandlordReadinessHarvest[],
): ReportReadinessSummary {
  if (!summary) return buildReportReadinessSummary({ totalItems: 0, issues: [] });

  const issues: ReportReadinessIssue[] = [];
  const activityFieldNames = new Set(summary.activity.map(activity => activity.fieldName));
  const fieldById = new Map(summary.fields.map(field => [field.fieldId, field]));

  for (const field of summary.fields) {
    if (!activityFieldNames.has(field.fieldName)) {
      issues.push({
        id: `landlord-${field.fieldId}-activity`, itemId: field.fieldId, fieldId: field.fieldId,
        severity: 'warning', category: 'Season activity', message: `${field.fieldName} has no activity in this season.`, actionLabel: 'Open field',
      });
    }
    if (!Number.isFinite(field.acres) || field.acres <= 0) {
      issues.push({
        id: `landlord-${field.fieldId}-acres`, itemId: field.fieldId, fieldId: field.fieldId,
        severity: 'error', category: 'Yield calculation', message: `${field.fieldName} has no usable acreage for yield calculations.`, actionLabel: 'Open field',
      });
    }
  }

  for (const harvest of harvestRecords) {
    if (!fieldById.has(harvest.fieldId)) continue;
    if (harvest.landlordSplitPercent == null || !Number.isFinite(harvest.landlordSplitPercent)) {
      issues.push({
        id: `landlord-${harvest.id}-share`, itemId: harvest.fieldId, fieldId: harvest.fieldId,
        recordId: harvest.id, recordType: 'harvest', severity: 'error', category: 'Crop share',
        message: `${harvest.fieldName} has a harvest with no crop-share percentage.`, actionLabel: 'Review harvest record',
      });
    } else if (harvest.landlordSplitPercent < 0 || harvest.landlordSplitPercent > 100) {
      issues.push({
        id: `landlord-${harvest.id}-share-range`, itemId: harvest.fieldId, fieldId: harvest.fieldId,
        recordId: harvest.id, recordType: 'harvest', severity: 'error', category: 'Crop share',
        message: `${harvest.fieldName} has a crop-share percentage outside 0–100%.`, actionLabel: 'Review harvest record',
      });
    }
  }

  return buildReportReadinessSummary({ totalItems: summary.fields.length, issues });
}
