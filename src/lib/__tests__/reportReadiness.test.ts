import { describe, expect, it } from 'vitest';

import {
  buildFsa578Readiness,
  buildFsaFallReadiness,
  buildReportReadinessSummary,
  buildSprayReadiness,
  buildFertilizerReadiness,
  buildHayReadiness,
  buildLandlordReadiness,
  type ReportReadinessIssue,
} from '@/lib/reportReadiness';

const issues: ReportReadinessIssue[] = [
  { id: '1', itemId: 'field-a', severity: 'error', category: 'Field setup', message: 'Missing tract.' },
  { id: '2', itemId: 'field-a', severity: 'warning', category: 'Field setup', message: 'Missing CLU.' },
  { id: '3', itemId: 'field-b', severity: 'info', category: 'Records', message: 'Review date.' },
];

describe('buildReportReadinessSummary', () => {
  it('counts affected items once when they have multiple issues', () => {
    expect(buildReportReadinessSummary({ totalItems: 5, issues })).toMatchObject({
      status: 'review',
      totalItems: 5,
      readyItems: 3,
      affectedItems: 2,
      errors: 1,
      warnings: 1,
      information: 1,
    });
  });

  it('returns ready when a non-empty report has no issues', () => {
    expect(buildReportReadinessSummary({ totalItems: 4, issues: [] })).toMatchObject({
      status: 'ready',
      readyItems: 4,
      affectedItems: 0,
    });
  });

  it('distinguishes an empty report from a ready report', () => {
    expect(buildReportReadinessSummary({ totalItems: 0, issues: [] })).toMatchObject({
      status: 'empty',
      totalItems: 0,
      readyItems: 0,
    });
  });

  it('accepts an authoritative ready count when issue IDs do not map one-to-one to report items', () => {
    expect(buildReportReadinessSummary({ totalItems: 10, readyItems: 6, issues })).toMatchObject({
      readyItems: 6,
      affectedItems: 4,
    });
  });

  it('clamps invalid counts to the available report items', () => {
    expect(buildReportReadinessSummary({ totalItems: -2, readyItems: 9, issues: [] })).toMatchObject({
      totalItems: 0,
      readyItems: 0,
      affectedItems: 0,
    });
  });
});

describe('summary report readiness', () => {
  it('validates fertilizer record completeness', () => {
    const summary = buildFertilizerReadiness([{
      id: 'fert-1', fieldId: 'missing-field', fieldName: 'North', date: '', acres: 0, fertilizer_formula: '',
    }], new Set(['field-1']));
    expect(summary).toMatchObject({ totalItems: 1, readyItems: 0, errors: 4 });
  });

  it('validates hay record completeness', () => {
    const summary = buildHayReadiness([{
      id: 'hay-1', fieldId: 'field-1', fieldName: 'South', date: '', baleCount: 0, cuttingNumber: 0,
    }], new Set(['field-1']));
    expect(summary).toMatchObject({ totalItems: 1, errors: 2, warnings: 1 });
  });

  it('finds landlord fields without activity, acreage, or crop share', () => {
    const summary = buildLandlordReadiness({
      fields: [{ fieldId: 'field-1', fieldName: 'West', acres: 0 }],
      activity: [],
    }, [{ id: 'harvest-1', fieldId: 'field-1', fieldName: 'West' }]);
    expect(summary).toMatchObject({ totalItems: 1, readyItems: 0, errors: 2, warnings: 1 });
  });
});

describe('spray readiness', () => {
  it('counts tank-mix issues against one application', () => {
    const summary = buildSprayReadiness([{
      id: 'spray-1',
      fieldId: 'field-1',
      fieldName: 'North',
      products: [
        { product: 'Product A', rate: '1', epaRegNumber: '' },
        { product: 'Product B', rate: '0', epaRegNumber: '' },
      ],
      applicatorName: '',
      licenseNumber: '',
      treatedAreaSize: 20,
      windSpeed: 12,
    }], 10);

    expect(summary).toMatchObject({
      totalItems: 1,
      readyItems: 0,
      affectedItems: 1,
      errors: 3,
      warnings: 2,
    });
  });

  it('returns ready for a complete application', () => {
    const summary = buildSprayReadiness([{
      id: 'spray-1',
      fieldId: 'field-1',
      fieldName: 'North',
      products: [{ product: 'Product A', rate: '1', epaRegNumber: '100-200' }],
      applicatorName: 'Operator',
      licenseNumber: 'ABC123',
      treatedAreaSize: 20,
      windSpeed: 7,
    }], 10);

    expect(summary).toMatchObject({ status: 'ready', readyItems: 1, errors: 0, warnings: 0 });
  });
});

describe('FSA readiness adapters', () => {
  it('counts FSA-578 readiness by field rather than expanded CLU rows', () => {
    const rows = [
      { id: 'north-clu-1', fieldId: 'field-north', fieldName: 'North' },
      { id: 'north-clu-2', fieldId: 'field-north', fieldName: 'North' },
      { id: 'south-clu-1', fieldId: 'field-south', fieldName: 'South' },
    ];
    const summary = buildFsa578Readiness(rows, [
      { rowId: 'north-clu-1', severity: 'error', field: 'farmNumber', message: 'North is missing a farm number.' },
      { rowId: 'north-clu-2', severity: 'warning', field: 'fieldNumber', message: 'North is missing a CLU number.' },
    ]);

    expect(summary).toMatchObject({ totalItems: 2, readyItems: 1, affectedItems: 1 });
    expect(summary.issues.map(issue => issue.category)).toEqual([
      'Farm, tract, and CLU setup',
      'Farm, tract, and CLU setup',
    ]);
    expect(summary.issues[0]).toMatchObject({ fieldId: 'field-north', itemId: 'field-north' });
  });

  it('keeps fields with duplicate names distinct', () => {
    const rows = [
      { id: 'north-1', fieldId: 'field-1', fieldName: 'North' },
      { id: 'north-2', fieldId: 'field-2', fieldName: 'North' },
    ];
    const summary = buildFsa578Readiness(rows, [
      { rowId: 'north-1', severity: 'error', field: 'farmNumber', message: 'North is missing a farm number.' },
    ]);

    expect(summary).toMatchObject({ totalItems: 2, readyItems: 1, affectedItems: 1 });
    expect(summary.issues[0]).toMatchObject({ fieldId: 'field-1' });
  });

  it('counts Fall FSA readiness by production record', () => {
    const rows = [
      { id: 'harvest-1', fieldName: 'North', recordType: 'grain' as const },
      { id: 'harvest-2', fieldName: 'South', recordType: 'hay' as const },
    ];
    const summary = buildFsaFallReadiness(rows, [
      { rowId: 'harvest-1', severity: 'warning', field: 'evidenceReference', message: 'North needs a ticket.' },
    ]);

    expect(summary).toMatchObject({ totalItems: 2, readyItems: 1, warnings: 1 });
    expect(summary.issues[0]).toMatchObject({
      category: 'Destination and evidence',
      recordId: 'harvest-1',
      recordType: 'harvest',
      actionLabel: 'Review record',
    });
  });

  it('routes Fall FSA hay rows to hay activity records', () => {
    const rows = [{ id: 'hay-1', fieldName: 'South', recordType: 'hay' as const }];
    const summary = buildFsaFallReadiness(rows, [
      { rowId: 'hay-1', severity: 'warning', field: 'evidenceReference', message: 'South needs evidence.' },
    ]);

    expect(summary.issues[0]).toMatchObject({ recordId: 'hay-1', recordType: 'hay' });
  });
});
