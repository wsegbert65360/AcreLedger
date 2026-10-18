/** Fill-in line used on compliance PDFs when the farm name is not known. */
export const FARM_NAME_PDF_BLANK = '________________';

/** On-screen stand-in. An em dash, never another farm's name. */
export const FARM_NAME_SCREEN_BLANK = '—';

/** Real farm name, or '' when it is missing or only whitespace. */
export function knownFarmName(farmName: string | null | undefined): string {
  return farmName?.trim() ?? '';
}

/** PDF text: the real name, or a blank the farmer can fill in. */
export function farmNameForPdf(farmName: string | null | undefined): string {
  return knownFarmName(farmName) || FARM_NAME_PDF_BLANK;
}

/** CSV metadata value. Empty when unknown so the sheet does not name a different farm. */
export function farmNameForCsv(farmName: string | null | undefined): string {
  return knownFarmName(farmName);
}

/** Desktop report header: the real name, or an em dash. */
export function farmNameScreenLabel(farmName: string | null | undefined): string {
  return knownFarmName(farmName) || FARM_NAME_SCREEN_BLANK;
}

/** Mobile readiness copy. "your farm" is a phrase, not a farm name. */
export function farmNameForProse(farmName: string | null | undefined): string {
  return knownFarmName(farmName) || 'your farm';
}

/** Shared FSA worksheet subtitle. Screen and PDF use different blanks. */
export function complianceFarmSubtitle(
  farmName: string | null | undefined,
  cropYear: number,
  reportDate: string,
  surface: 'screen' | 'pdf' = 'screen',
): string {
  const name = surface === 'pdf' ? farmNameForPdf(farmName) : farmNameScreenLabel(farmName);
  return `Farm: ${name} | Crop Year: ${cropYear} | Not an official USDA form. Generated ${reportDate}.`;
}
