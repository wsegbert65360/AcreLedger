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
        { product: 'Product A', rate: '1', rateUnit: 'oz/ac', epaRegNumber: '' },
        { product: 'Product B', rate: '0', rateUnit: 'oz/ac', epaRegNumber: '' },
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
      products: [{ product: 'Product A', rate: '1', rateUnit: 'oz/ac', epaRegNumber: '100-200' }],
      applicatorName: 'Operator',
      licenseNumber: 'ABC123',
      treatedAreaSize: 20,
      windSpeed: 7,
    }], 10);

    expect(summary).toMatchObject({ status: 'ready', readyItems: 1, errors: 0, warnings: 0 });
  });

  it('flags a unitless rate like the canonical compliance rule', () => {
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

    expect(summary).toMatchObject({ status: 'review', errors: 1 });
    expect(summary.issues.some(i => i.id === 'spray-spray-1-rate-0')).toBe(true);
  });

  it('does not flag a missing treated area when the field acreage fallback resolves', () => {
    const summary = buildSprayReadiness([{
      id: 'spray-1',
      fieldId: 'field-1',
      fieldName: 'North',
      products: [{ product: 'Product A', rate: '1', rateUnit: 'oz/ac', epaRegNumber: '100-200' }],
      applicatorName: 'Operator',
      licenseNumber: 'ABC123',
      treatedAreaSize: undefined,
      windSpeed: 7,
    }], 10, [
      { id: 'field-1', name: 'North', acreage: 40, farm_id: 'farm-1', deleted_at: null, lat: null, lng: null },
    ] as never[]);

    expect(summary).toMatchObject({ status: 'ready', errors: 0, warnings: 0 });
  });

  it('warns (not errors) when no treated area and no resolvable field acreage exist', () => {
    const summary = buildSprayReadiness([{
      id: 'spray-1',
      fieldId: 'field-1',
      fieldName: 'North',
      products: [{ product: 'Product A', rate: '1', rateUnit: 'oz/ac', epaRegNumber: '100-200' }],
      applicatorName: 'Operator',
      licenseNumber: 'ABC123',
      treatedAreaSize: undefined,
      windSpeed: 7,
    }], 10);

    expect(summary).toMatchObject({ status: 'review', errors: 0, warnings: 1 });
    expect(summary.issues.some(i => i.id === 'spray-spray-1-area' && i.severity === 'warning')).toBe(true);
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

function completeAuSpray(overrides: Record<string, unknown> = {}) {
  return {
    id: 'spray-au',
    fieldId: 'field-1',
    fieldName: 'Paddock 1',
    products: [
      { product: 'Glyphosate', rate: '1', rateUnit: 'L/ha', epaRegNumber: '' },
    ],
    complianceProfile: 'au-apvma',
    applicatorName: 'Jack',
    sprayDate: '2026-10-01',
    startTime: '06:00',
    endTime: '08:00',
    pic: 'NABC1234',
    cropOrSiteTreated: 'Wheat',
    targetPest: 'Ryegrass',
    treatedAreaSize: 40,
    waterRate: '100',
    equipmentId: 'Sprayer 1',
    windDirection: 'NW',
    windSpeed: 10,
    sensitiveAreaCheck: true,
    ...overrides,
  };
}

describe('buildSprayReadiness with compliance profiles (P2)', () => {
  it('does not report a missing EPA number as an error for au-apvma records', () => {
    const summary = buildSprayReadiness([{
      id: 'spray-au',
      fieldId: 'field-1',
      fieldName: 'Paddock 1',
      products: [
        { product: 'Glyphosate', rate: '1', rateUnit: 'L/ha', epaRegNumber: '' },
      ],
      complianceProfile: 'au-apvma',
      applicatorName: 'Jack',
      treatedAreaSize: 40,
      windSpeed: 10,
    }], 10);

    const messages = summary.issues.map(i => i.message);
    expect(messages.some(m => m.includes('EPA registration number'))).toBe(false);
  });

  it('still reports a missing EPA number as an error for us-epa records', () => {
    const summary = buildSprayReadiness([{
      id: 'spray-us',
      fieldId: 'field-1',
      fieldName: 'North',
      products: [
        { product: 'Atrazine', rate: '1', rateUnit: 'qt/ac', epaRegNumber: '' },
      ],
      complianceProfile: 'universal',
      applicatorName: 'Farmer',
      treatedAreaSize: 20,
      windSpeed: 12,
    }], 10);

    const messages = summary.issues.map(i => i.message);
    expect(messages.some(m => m.includes('EPA registration number'))).toBe(true);
  });
});

describe('buildSprayReadiness NSW missing-fields list (au-apvma)', () => {
  it('returns ready for a complete AU application without a license or EPA number', () => {
    const summary = buildSprayReadiness([completeAuSpray()], 10);

    expect(summary).toMatchObject({ status: 'ready', readyItems: 1, errors: 0, warnings: 0 });
  });

  it('lists NSW gaps under NSW record details and does not warn about license', () => {
    const summary = buildSprayReadiness([completeAuSpray({
      pic: '',
      waterRate: '',
      endTime: '',
      licenseNumber: '',
    })], 10);

    expect(summary.issues.some(i => i.message.includes('license'))).toBe(false);
    expect(summary.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'NSW record details',
        message: 'Paddock 1 is missing Water rate.',
      }),
      expect.objectContaining({
        category: 'NSW record details',
        message: 'Paddock 1 is missing Finish time.',
      }),
    ]));
  });

  it('sends a missing PIC to the paddock instead of the spray record', () => {
    const summary = buildSprayReadiness([completeAuSpray({ pic: '' })], 10);
    const picIssue = summary.issues.find(i => i.id === 'spray-spray-au-nsw-property-pic');

    expect(picIssue).toMatchObject({
      category: 'NSW record details',
      message: 'Paddock 1 has no Property Identification Code (PIC). Set it on the paddock.',
      itemId: 'spray-au',
      fieldId: 'field-1',
      actionLabel: 'Open field',
    });
    expect(picIssue?.recordType).toBeUndefined();
    expect(picIssue?.recordId).toBeUndefined();
  });

  it('does not judge a US or universal record with the NSW list', () => {
    const summary = buildSprayReadiness([{
      id: 'spray-us',
      fieldId: 'field-1',
      fieldName: 'North',
      products: [{ product: 'Atrazine', rate: '1', rateUnit: 'qt/ac', epaRegNumber: '100-200' }],
      applicatorName: 'Farmer',
      licenseNumber: 'ABC123',
      treatedAreaSize: 20,
      windSpeed: 7,
      complianceProfile: 'universal',
    }], 10);

    expect(summary).toMatchObject({ status: 'ready', errors: 0, warnings: 0 });
    expect(summary.issues.some(i => i.category === 'NSW record details')).toBe(false);
  });

  it('flags a missing AU product label name', () => {
    const summary = buildSprayReadiness([completeAuSpray({
      products: [{ product: '  ', rate: '1', rateUnit: 'L/ha' }],
    })], 10);

    expect(summary.issues.some(i => i.id === 'spray-spray-au-name-0')).toBe(true);
    expect(summary.issues.some(i => i.message.includes('product label name'))).toBe(true);
  });

  it('treats wind speed 0 as filled and does not list Wind speed as missing', () => {
    const summary = buildSprayReadiness([completeAuSpray({ windSpeed: 0 })], 10);

    expect(summary.issues.some(i => i.message.includes('Wind speed'))).toBe(false);
    expect(summary).toMatchObject({ status: 'ready', errors: 0, warnings: 0 });
  });

  it('treats an unchecked sensitive-area box as answered', () => {
    const answered = buildSprayReadiness([completeAuSpray({ sensitiveAreaCheck: false })], 10);
    expect(answered).toMatchObject({ status: 'ready', errors: 0 });

    const unanswered = buildSprayReadiness([completeAuSpray({ sensitiveAreaCheck: undefined })], 10);
    expect(unanswered.issues.some(i => i.message.includes('Sensitive areas / buffers'))).toBe(true);
  });

  it('converts stored AU wind from mph to km/h before the threshold and the warning', () => {
    // 9 mph is 14.5 km/h, under the 16.1 km/h line (10 mph).
    const normal = buildSprayReadiness([completeAuSpray({ windSpeed: 9 })], 10);
    expect(normal.issues.some(i => i.id.endsWith('-wind'))).toBe(false);
    expect(normal).toMatchObject({ status: 'ready', warnings: 0 });

    // 10 mph converts to 16.1 km/h, equal to the threshold, so it does not warn.
    const atLine = buildSprayReadiness([completeAuSpray()], 10);
    expect(atLine.issues.some(i => i.id.endsWith('-wind'))).toBe(false);

    // 15 mph is stored as mph and converts to 24.1 km/h. Comparing the raw 15
    // to the 16.1 km/h line would miss it. The warning must say 24.1, not 15.
    const high = buildSprayReadiness([completeAuSpray({ windSpeed: 15 })], 10);
    expect(high.issues.find(i => i.id === 'spray-spray-au-wind')).toMatchObject({
      severity: 'warning',
      category: 'Weather conditions',
      message: 'Paddock 1 recorded wind at 24.1 km/h, above the 16.1 km/h review threshold.',
    });
  });

  it('still words a US wind warning in mph', () => {
    const summary = buildSprayReadiness([{
      id: 'spray-1',
      fieldId: 'field-1',
      fieldName: 'North',
      products: [{ product: 'Product A', rate: '1', rateUnit: 'oz/ac', epaRegNumber: '100-200' }],
      applicatorName: 'Operator',
      licenseNumber: 'ABC123',
      treatedAreaSize: 20,
      windSpeed: 12,
    }], 10);

    expect(summary.issues.find(i => i.id === 'spray-spray-1-wind')?.message).toBe(
      'North recorded wind at 12 mph, above the 10 mph review threshold.',
    );
  });

  it('requires a stored AU treated area and does not fall back to field acreage', () => {
    const summary = buildSprayReadiness([completeAuSpray({ treatedAreaSize: undefined })], 10, [
      { id: 'field-1', name: 'Paddock 1', acreage: 40, farm_id: 'farm-1', deleted_at: null, lat: null, lng: null },
    ] as never[]);

    expect(summary.issues.some(i => i.id === 'spray-spray-au-area')).toBe(false);
    expect(summary.issues.find(i => i.id === 'spray-spray-au-nsw-treated-area-ha')).toMatchObject({
      severity: 'error',
      category: 'NSW record details',
      message: 'Paddock 1 is missing Treated area (ha).',
    });
  });
});
