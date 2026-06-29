import type { HarvestRecord } from '../../types/farm';

export type LandlordStatementRow = {
  fieldName: string;
  crop: string;
  harvestDate: string;          // formatted as MM/DD/YYYY for display
  totalBushels: number;
  landlordSplitPercent: number;
  landlordBushels: number;      // totalBushels * (landlordSplitPercent / 100)
  scaleTicketNumber?: string;
};

export type LandlordStatement = {
  landlordName: string;
  generatedAt: string;          // ISO timestamp of when the report was run
  rows: LandlordStatementRow[];
  totalLandlordBushels: number; // sum of all landlordBushels
  totalFarmerBushels: number;   // sum of (totalBushels - landlordBushels)
};

export function generateLandlordStatement(
  records: HarvestRecord[],
  landlordName: string
): LandlordStatement {
  // 1. Filter to only this landlord's records
  const filtered = records.filter(
    r => r.landlordName?.trim().toLowerCase() === landlordName.trim().toLowerCase()
  );

  // 2. Sort by harvest date ascending (oldest first)
  const sorted = [...filtered].sort(
    (a, b) => new Date(a.harvestDate || 0).getTime() - new Date(b.harvestDate || 0).getTime()
  );

  // 3. Map to statement rows
  const rows: LandlordStatementRow[] = sorted.map(r => {
    const landlordBushels = parseFloat(
      ((r.bushels || 0) * ((r.landlordSplitPercent || 0) / 100)).toFixed(2)
    );
    return {
      fieldName: r.fieldName,
      crop: r.crop || 'Unknown',
      harvestDate: formatDate(r.harvestDate || new Date(r.timestamp || Date.now()).toISOString()),
      totalBushels: r.bushels || 0,
      landlordSplitPercent: r.landlordSplitPercent || 0,
      landlordBushels,
      scaleTicketNumber: r.scaleTicketNumber,
    };
  });

  // 4. Compute totals
  const totalLandlordBushels = parseFloat(
    rows.reduce((sum, r) => sum + r.landlordBushels, 0).toFixed(2)
  );
  const totalFarmerBushels = parseFloat(
    rows.reduce((sum, r) => sum + (r.totalBushels - r.landlordBushels), 0).toFixed(2)
  );

  return {
    landlordName,
    generatedAt: new Date().toISOString(),
    rows,
    totalLandlordBushels,
    totalFarmerBushels,
  };
}

function escapeCsvCell(val: string | number): string {
  let str = String(val);
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    str = `'${str}`;
  }
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

export function generateLandlordStatementCSV(statement: LandlordStatement): string {
  const headers = [
    'Field Name',
    'Crop',
    'Harvest Date',
    'Scale Ticket #',
    'Total Bushels',
    'Landlord Split %',
    'Landlord Bushels',
    'Farmer Bushels',
  ];

  const dataRows = statement.rows.map(r => [
    r.fieldName,
    r.crop,
    r.harvestDate,
    r.scaleTicketNumber || '',
    String(r.totalBushels),
    `${r.landlordSplitPercent}%`,
    String(r.landlordBushels),
    String(parseFloat((r.totalBushels - r.landlordBushels).toFixed(2))),
  ]);

  const totalsRow = [
    'TOTAL',
    '',
    '',
    '',
    '',
    '', // aligns with 'Landlord Split %' column
    String(statement.totalLandlordBushels),
    String(statement.totalFarmerBushels),
  ];

  const allRows = [headers, ...dataRows, totalsRow];
  return allRows.map(row => row.map(cell => escapeCsvCell(cell)).join(',')).join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateLandlordStatementHTML(statement: LandlordStatement): string {
  const reportDate = new Date(statement.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const rowsHTML = statement.rows.map(r => `
    <tr>
      <td>${escapeHtml(r.fieldName)}</td>
      <td>${escapeHtml(r.crop)}</td>
      <td>${escapeHtml(r.harvestDate)}</td>
      <td>${r.scaleTicketNumber ? escapeHtml(r.scaleTicketNumber) : '—'}</td>
      <td class="num">${r.totalBushels.toLocaleString()}</td>
      <td class="num">${r.landlordSplitPercent}%</td>
      <td class="num bold">${r.landlordBushels.toLocaleString()}</td>
    </tr>
  `).join('');

  return `
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #222; margin: 40px; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #2d5a1b; color: white; padding: 8px 12px; text-align: left; font-size: 12px; }
        td { padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
        tr:nth-child(even) { background: #f7f7f7; }
        .num { text-align: right; }
        .bold { font-weight: bold; }
        .totals-row { background: #eef4ea !important; font-weight: bold; border-top: 2px solid #2d5a1b; }
        .totals-row td { padding: 10px 12px; }
        .footer { margin-top: 32px; font-size: 11px; color: #999; }
      </style>
    </head>
    <body>
      <h1>Crop Share Statement</h1>
      <div class="subtitle">
        Prepared for: <strong>${escapeHtml(statement.landlordName)}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        Report Date: ${reportDate}
      </div>

      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Crop</th>
            <th>Harvest Date</th>
            <th>Scale Ticket #</th>
            <th style="text-align:right">Total Bu.</th>
            <th style="text-align:right">Your Split</th>
            <th style="text-align:right">Your Bushels</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
          <tr class="totals-row">
            <td colspan="6">Total Landlord Bushels</td>
            <td class="num">${statement.totalLandlordBushels.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer">
        Generated by Acreledger &nbsp;|&nbsp; ${reportDate}
      </div>
    </body>
    </html>
  `;
}

export function getUniqueLandlordNames(records: HarvestRecord[]): string[] {
  const names = records
    .map(r => r.landlordName?.trim())
    .filter((n): n is string => !!n);
  return [...new Set(names)].sort();
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return 'N/A';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
