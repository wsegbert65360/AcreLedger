/**
 * Compliance profile registry (Australia pilot Phase 2b).
 *
 * The single source of truth for spray-record compliance metadata: which
 * profile a record belongs to, what fields each profile requires, and what
 * product-level checks apply. US behavior is frozen — the 'us-epa' profile
 * pins the exact field set and checks the app has always enforced.
 *
 * Profile IDs are typed as 'us-epa' | 'au-apvma'. Stored records may carry
 * legacy/placeholder values (notably 'universal', the long-standing default);
 * resolveComplianceProfileId() maps those to 'us-epa' so every existing US
 * record keeps its current behavior.
 */

/** Typed compliance profile identifiers. */
export type ComplianceProfileId = 'us-epa' | 'au-apvma';

/** Country codes that select a default profile. */
export type ComplianceCountry = 'US' | 'AU';

/** One field in a profile's required-field set. */
export interface ComplianceProfileField {
  /** Stable key, e.g. 'applicatorName'. */
  key: string;
  /** Display label, e.g. 'Cert. applicator'. */
  label: string;
  /** Whether the field is required for full compliance. */
  required: boolean;
}

/** Product-level checks applied by sprayProductsNeedReview. */
export interface ComplianceProductChecks {
  requireName: boolean;
  requireRegistrationNumber: boolean;
  requireRate: boolean;
}

/** A compliance profile: field set, labels, and validation metadata. */
export interface ComplianceProfile {
  id: ComplianceProfileId;
  /** Display label, e.g. 'US EPA'. */
  label: string;
  country: ComplianceCountry;
  fields: ComplianceProfileField[];
  productChecks: ComplianceProductChecks;
}

const US_EPA_FIELDS: ComplianceProfileField[] = [
  { key: 'productNames', label: 'Product name(s)', required: true },
  { key: 'startTime', label: 'Start time', required: true },
  { key: 'endTime', label: 'End time', required: true },
  { key: 'weather', label: 'Weather data', required: true },
  { key: 'applicatorName', label: 'Cert. applicator', required: true },
  { key: 'licenseNumber', label: 'License #', required: true },
  { key: 'windDirection', label: 'Wind direction', required: true },
  { key: 'cropOrSite', label: 'Crop / site treated', required: true },
  { key: 'applicationMethod', label: 'Application method', required: true },
  { key: 'equipmentId', label: 'Equipment ID', required: true },
  { key: 'epaRegNumbers', label: 'EPA Reg # (one or more products)', required: true },
  { key: 'rates', label: 'Application rate (one or more products)', required: true },
];

/**
 * AU APVMA profile field set from the Phase 0 NSW EPA/DPI verification:
 * date, start/finish time, applicator, PIC/paddock/area, crop and target,
 * full label name, rate/dose, water rate, equipment, wind, sensitive areas.
 * Labels use Australian terms (paddock, finish time).
 */
const AU_APVMA_FIELDS: ComplianceProfileField[] = [
  { key: 'sprayDate', label: 'Date', required: true },
  { key: 'startTime', label: 'Start time', required: true },
  { key: 'endTime', label: 'Finish time', required: true },
  { key: 'applicatorName', label: 'Applicator name', required: true },
  { key: 'pic', label: 'Property / PIC', required: true },
  { key: 'paddock', label: 'Paddock name/number', required: true },
  { key: 'treatedArea', label: 'Treated area (ha)', required: true },
  { key: 'crop', label: 'Crop / situation', required: true },
  { key: 'targetPest', label: 'Target pest/weed/disease', required: true },
  { key: 'productNames', label: 'Product label name(s)', required: true },
  { key: 'rates', label: 'Rate/dose', required: true },
  { key: 'waterRate', label: 'Water rate', required: true },
  { key: 'equipment', label: 'Equipment type', required: true },
  { key: 'windSpeed', label: 'Wind speed', required: true },
  { key: 'windDirection', label: 'Wind direction', required: true },
  { key: 'sensitiveAreas', label: 'Sensitive areas / buffers', required: true },
];

export const COMPLIANCE_PROFILES: Record<ComplianceProfileId, ComplianceProfile> = {
  'us-epa': {
    id: 'us-epa',
    label: 'US EPA',
    country: 'US',
    fields: US_EPA_FIELDS,
    productChecks: {
      requireName: true,
      requireRegistrationNumber: true,
      requireRate: true,
    },
  },
  'au-apvma': {
    id: 'au-apvma',
    label: 'AU APVMA',
    country: 'AU',
    fields: AU_APVMA_FIELDS,
    productChecks: {
      // APVMA approval / permit numbers are captured per record but only
      // required "when relevant" (NSW EPA), so they don't flag review.
      requireName: true,
      requireRegistrationNumber: false,
      requireRate: true,
    },
  },
};

/**
 * Resolves a stored complianceProfile value to a typed profile ID.
 * Legacy/placeholder values ('universal', '', null, undefined) and any
 * unknown string resolve to 'us-epa', preserving US behavior for all
 * existing records.
 */
export function resolveComplianceProfileId(
  value: string | null | undefined,
): ComplianceProfileId {
  if (value === 'au-apvma') return 'au-apvma';
  return 'us-epa';
}

/** Returns the registry entry for a profile ID. */
export function getComplianceProfile(id: ComplianceProfileId): ComplianceProfile {
  return COMPLIANCE_PROFILES[id];
}

/** Resolves a stored value straight to its registry entry. */
export function getComplianceProfileFor(
  value: string | null | undefined,
): ComplianceProfile {
  return getComplianceProfile(resolveComplianceProfileId(value));
}

/** Default profile for a country: US → us-epa, AU → au-apvma. */
export function defaultProfileForCountry(country: ComplianceCountry): ComplianceProfileId {
  return country === 'AU' ? 'au-apvma' : 'us-epa';
}

/** Labels of the required fields for a profile, in order. */
export function requiredFieldLabels(id: ComplianceProfileId): string[] {
  return COMPLIANCE_PROFILES[id].fields
    .filter(f => f.required)
    .map(f => f.label);
}
