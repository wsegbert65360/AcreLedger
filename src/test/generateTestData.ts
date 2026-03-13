/**
 * Realistic test data generator for AcreLedger.
 * Generates 100 of every entity type with realistic Missouri/Midwest farm data.
 */

import type {
  Field, PlantRecord, SprayRecord, HarvestRecord,
  HayHarvestRecord, Bin, GrainMovement, SavedSeed,
  SprayRecipe, FertilizerApplication, SprayRecipeProduct
} from '@/types/farm';

// --- Helpers ---

let _counter = 0;
function uid(): string {
  _counter++;
  return crypto.randomUUID();
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// --- Realistic Data Pools ---

const FIELD_NAMES = [
  'North 40', 'South Bottom', 'Home Place', 'River Field', 'Hilltop', 'Creek Bottom',
  'Back 80', 'Front Field', 'East Pasture', 'West Meadow', 'Long Field', 'Short Row',
  'Pond Field', 'Barn Lot', 'Old Orchard', 'New Ground', 'Timber Edge', 'Highway Field',
  'Corner Lot', 'Section 12', 'Section 8', 'Wheat Stubble', 'CRP Ground', 'Washed Field',
  'Ridge Top', 'Valley Floor', 'Terrace Field', 'Strip Field', 'Waterway Field', 'Pivot Field',
  'Dryland Quarter', 'Fence Row', 'South 80', 'North 160', 'County Line', 'School Section',
  'Church Field', 'Anderson Place', 'Miller Farm', 'Jenkins Bottom', 'Clay Knoll', 'Sand Ridge',
  'Buckner Tract', 'Johnson Lease', 'Smith Ground', 'Taylor 40', 'Wilson Bottom', 'Brown Terrace',
  'Davis Strip', 'Moore Quarter', 'Thompson Home', 'Garcia Pasture', 'Martinez Meadow',
  'Robinson Creek', 'Clark Ridge', 'Lewis Valley', 'Walker Bend', 'Hall Flat', 'Allen Corner',
  'Young Hollow', 'Hernandez Field', 'King Bottom', 'Wright Terrace', 'Lopez Ridge',
  'Hill 40', 'Scott Place', 'Green Acres', 'Adams Farm', 'Baker Flat', 'Gonzalez Strip',
  'Nelson Tract', 'Carter Bottom', 'Mitchell Field', 'Perez Meadow', 'Roberts Creek',
  'Turner Valley', 'Phillips Ridge', 'Campbell Bend', 'Parker Flat', 'Evans Corner',
  'Edwards Hollow', 'Collins Field', 'Stewart Bottom', 'Sanchez Terrace', 'Morris Ridge',
  'Rogers Creek', 'Reed Valley', 'Cook Bend', 'Morgan Flat', 'Bell Corner', 'Murphy Hollow',
  'Bailey Field', 'Rivera Bottom', 'Cooper Terrace', 'Richardson Ridge', 'Cox Creek',
  'Howard Valley', 'Ward Bend', 'Torres Flat', 'Peterson Corner', 'Gray Hollow',
];

const CROPS = ['Corn', 'Soybeans', 'Wheat', 'Grain Sorghum', 'Corn', 'Soybeans', 'Corn'];
const SEED_VARIETIES = [
  'DKC 64-35', 'P1185AM', 'AG36X6', 'NK S29-L2X', 'Pioneer P35T58',
  'Asgrow AG46X6', 'DKC 62-08', 'Channel 206-53', 'Stine 37LF32',
  'Golden Harvest GH4055X', 'Becks 6175A', 'LG Seeds C5825VT2P',
  'Mycogen MY09V42', 'Dyna-Gro S48EN62', 'Go Soy 4915XS', 'USG 7480XT',
  'Armor 49-D40', 'MFA M055', 'Progeny PGY 4920RXS', 'Lewis 4870',
];

const INTENDED_USES = ['Grain', 'Grain', 'Grain', 'Forage', 'Seed', 'Hay', 'Pasture'];

const SPRAY_PRODUCTS = [
  { product: 'Roundup PowerMAX', epa: '524-549', rate: '22', unit: 'oz/ac' },
  { product: 'Liberty 280 SL', epa: '264-829', rate: '29', unit: 'oz/ac' },
  { product: 'Engenia', epa: '7969-345', rate: '12.8', unit: 'oz/ac' },
  { product: 'XtendiMax', epa: '524-617', rate: '22', unit: 'oz/ac' },
  { product: 'Warrant', epa: '524-591', rate: '48', unit: 'oz/ac' },
  { product: 'Acuron', epa: '100-1466', rate: '2.5', unit: 'qt/ac' },
  { product: 'Atrazine 4L', epa: '34704-69', rate: '1', unit: 'qt/ac' },
  { product: 'Status', epa: '7969-233', rate: '5', unit: 'oz/ac' },
  { product: 'Prefix', epa: '100-1232', rate: '2', unit: 'pt/ac' },
  { product: 'Flexstar GT', epa: '100-1314', rate: '3.5', unit: 'pt/ac' },
  { product: 'Valor SX', epa: '59639-120', rate: '2', unit: 'oz/ac' },
  { product: 'Prowl H2O', epa: '241-418', rate: '2', unit: 'pt/ac' },
  { product: 'Sharpen', epa: '7969-278', rate: '1', unit: 'oz/ac' },
  { product: '2,4-D LV6', epa: '34704-803', rate: '1', unit: 'pt/ac' },
  { product: 'Trivapro', epa: '100-1576', rate: '13.7', unit: 'oz/ac' },
];

const TARGET_PESTS = [
  'Broadleaf weeds', 'Grasses', 'Marestail', 'Palmer amaranth', 'Waterhemp',
  'Giant ragweed', 'Foxtail', 'Lambsquarters', 'Velvetleaf', 'Morning glory',
];

const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const EQUIPMENT_IDS = ['JD 4630', 'Hagie STS 12', 'Apache AS1220', 'Miller Nitro 5240', 'Rogator RG1300'];
const APPLICATORS = ['John Smith', 'Mike Davis', 'Sarah Johnson', 'Tom Wilson', 'Bill Anderson'];
const DESTINATIONS_SELL = ['MFA Elevator', 'Cargill', 'ADM', 'Local Co-op', 'River Terminal', 'Scoular Grain'];
const BIN_NAMES = [
  'Bin 1', 'Bin 2', 'Bin 3', 'Bin 4', 'Bin 5', 'Bin 6', 'Bin 7', 'Bin 8',
  'Flat Storage', 'Wet Bin', 'Dryer Bin', 'Leg Bin', 'Hopper Bin A', 'Hopper Bin B',
  'Sukup 36', 'Butler 48', 'Brock 60', 'Small Bin', 'Overflow', 'Corn Bin',
];

const FERTILIZER_FORMULAS = [
  '28-0-0 (UAN)', '46-0-0 (Urea)', '18-46-0 (DAP)', '11-52-0 (MAP)',
  '0-0-60 (Potash)', '10-34-0', '32-0-0', '21-0-0-24S (AMS)',
  '12-40-0-10S-1Zn', '46-0-0 + Agrotain',
];

const BALE_TYPES: ('Round' | 'Square')[] = ['Round', 'Round', 'Round', 'Square'];
const HAY_CONDITIONS = ['Dry & sunny', 'Partly cloudy', 'Hot & dry', 'Warm, light breeze', 'Overcast, low humidity'];

const SEASON_YEAR = 2026;

// --- Generators ---

export function generateFields(count = 100): Field[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    name: i < FIELD_NAMES.length ? FIELD_NAMES[i] : `Field ${i + 1}`,
    acreage: randFloat(15, 200, 1),
    lat: randFloat(36.5, 40.5, 6),  // Missouri lat range
    lng: randFloat(-95.5, -89.5, 6), // Missouri lng range
    fsaFarmNumber: `${randInt(1000, 9999)}`,
    fsaTractNumber: `${randInt(100, 999)}`,
    fsaFieldNumber: `${randInt(1, 50)}`,
    producerShare: pick([100, 100, 100, 66, 50, 75]),
    irrigationPractice: pick(['Non-Irrigated', 'Non-Irrigated', 'Non-Irrigated', 'Irrigated']) as 'Irrigated' | 'Non-Irrigated',
    intendedUse: pick(INTENDED_USES),
  }));
}

export function generateBins(count = 100): Bin[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    name: i < BIN_NAMES.length ? BIN_NAMES[i] : `Bin ${i + 1}`,
    capacity: pick([5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 50000]),
  }));
}

export function generateSavedSeeds(count = 100): SavedSeed[] {
  const usedNames = new Set<string>();
  return Array.from({ length: count }, (_, i) => {
    let name: string;
    if (i < SEED_VARIETIES.length) {
      name = SEED_VARIETIES[i];
    } else {
      name = `Variety-${randInt(1000, 9999)}`;
    }
    // Deduplicate
    while (usedNames.has(name)) name = `${name}-${randInt(1, 99)}`;
    usedNames.add(name);
    return { id: uid(), name };
  });
}

export function generateSprayRecipes(count = 100): Omit<SprayRecipe, 'id'>[] {
  const recipeNames = [
    'Burndown Mix', 'Pre-Emerge Blend', 'Post-Emerge Corn', 'Post-Emerge Beans',
    'Fall Burndown', 'Spring Burndown', 'Dicamba Mix', 'Liberty Mix',
    'Fungicide Pass', 'Late Season Cleanup',
  ];

  return Array.from({ length: count }, (_, i) => {
    const numProducts = randInt(1, 3);
    const products: SprayRecipeProduct[] = Array.from({ length: numProducts }, () => {
      const p = pick(SPRAY_PRODUCTS);
      return { id: uid(), product: p.product, rate: p.rate, rateUnit: p.unit, epaRegNumber: p.epa };
    });

    return {
      name: i < recipeNames.length ? recipeNames[i] : `Recipe ${i + 1}`,
      products,
      applicatorName: pick(APPLICATORS),
      licenseNumber: `MO-${randInt(10000, 99999)}`,
      targetPest: pick(TARGET_PESTS),
    };
  });
}

export function generatePlantRecords(fields: Field[], seeds: SavedSeed[], count = 100): Omit<PlantRecord, 'id' | 'timestamp'>[] {
  return Array.from({ length: count }, () => {
    const field = pick(fields);
    const crop = pick(CROPS);
    const seed = pick(seeds);
    const month = randInt(3, 5);
    const day = randInt(1, 28);

    return {
      fieldId: field.id,
      fieldName: field.name,
      seedVariety: seed.name,
      acreage: field.acreage,
      crop,
      plantDate: isoDate(SEASON_YEAR, month, day),
      fsaFarmNumber: field.fsaFarmNumber,
      fsaTractNumber: field.fsaTractNumber,
      fsaFieldNumber: field.fsaFieldNumber,
      intendedUse: field.intendedUse || 'Grain',
      producerShare: field.producerShare ?? 100,
      irrigationPractice: field.irrigationPractice || 'Non-Irrigated',
      seasonYear: SEASON_YEAR,
    };
  });
}

export function generateSprayRecords(fields: Field[], count = 100): Omit<SprayRecord, 'id' | 'timestamp'>[] {
  return Array.from({ length: count }, () => {
    const field = pick(fields);
    const numProducts = randInt(1, 3);
    const products: SprayRecipeProduct[] = Array.from({ length: numProducts }, () => {
      const p = pick(SPRAY_PRODUCTS);
      return { id: uid(), product: p.product, rate: p.rate, rateUnit: p.unit, epaRegNumber: p.epa };
    });
    const month = randInt(4, 8);
    const day = randInt(1, 28);
    const hour = randInt(6, 18);
    const minute = pick(['00', '15', '30', '45']);

    return {
      fieldId: field.id,
      fieldName: field.name,
      products,
      windSpeed: randInt(2, 12),
      temperature: randInt(55, 95),
      sprayDate: isoDate(SEASON_YEAR, month, day),
      startTime: `${String(hour).padStart(2, '0')}:${minute}`,
      equipmentId: pick(EQUIPMENT_IDS),
      applicatorName: pick(APPLICATORS),
      licenseNumber: `MO-${randInt(10000, 99999)}`,
      epaRegNumber: products[0].epaRegNumber,
      targetPest: pick(TARGET_PESTS),
      windDirection: pick(WIND_DIRECTIONS),
      relativeHumidity: randInt(30, 85),
      treatedAreaSize: `${field.acreage}`,
      totalAmountApplied: `${(parseFloat(products[0].rate) * field.acreage).toFixed(1)}`,
      seasonYear: SEASON_YEAR,
    };
  });
}

export function generateHarvestRecords(fields: Field[], bins: Bin[], count = 100): Omit<HarvestRecord, 'id' | 'timestamp'>[] {
  return Array.from({ length: count }, () => {
    const field = pick(fields);
    const bin = pick(bins);
    const destination = pick(['bin', 'bin', 'bin', 'town']) as 'bin' | 'town';
    const month = randInt(9, 11);
    const day = randInt(1, 28);
    const crop = pick(CROPS);

    return {
      fieldId: field.id,
      fieldName: field.name,
      crop,
      destination,
      binId: destination === 'bin' ? bin.id : undefined,
      bushels: randInt(200, 2500),
      moisturePercent: randFloat(12, 22, 1),
      landlordSplitPercent: pick([0, 0, 0, 25, 33, 50]),
      harvestDate: isoDate(SEASON_YEAR, month, day),
      fsaFarmNumber: field.fsaFarmNumber,
      fsaTractNumber: field.fsaTractNumber,
      seasonYear: SEASON_YEAR,
    };
  });
}

export function generateHayRecords(fields: Field[], count = 100): Omit<HayHarvestRecord, 'id' | 'timestamp'>[] {
  const hayFields = fields.filter(f =>
    (f.intendedUse || '').toLowerCase().includes('hay') ||
    (f.intendedUse || '').toLowerCase().includes('pasture') ||
    (f.intendedUse || '').toLowerCase().includes('forage')
  );
  // If not enough hay fields, use any
  const pool = hayFields.length >= 10 ? hayFields : fields;

  return Array.from({ length: count }, () => {
    const field = pick(pool);
    const cutting = randInt(1, 4);
    const baseMonth = cutting === 1 ? 5 : cutting === 2 ? 7 : cutting === 3 ? 8 : 9;
    const day = randInt(1, 28);

    return {
      fieldId: field.id,
      fieldName: field.name,
      date: isoDate(SEASON_YEAR, baseMonth, day),
      baleCount: randInt(15, 120),
      cuttingNumber: cutting,
      baleType: pick(BALE_TYPES),
      temperature: randInt(70, 100),
      conditions: pick(HAY_CONDITIONS),
      seasonYear: SEASON_YEAR,
    };
  });
}

export function generateFertilizerRecords(fields: Field[], count = 100): Omit<FertilizerApplication, 'id' | 'created_at' | 'updated_at' | 'fieldName'>[] {
  return Array.from({ length: count }, () => {
    const field = pick(fields);
    const month = pick([2, 3, 4, 10, 11]); // Pre-plant or fall
    const day = randInt(1, 28);

    return {
      farm_id: '',
      fieldId: field.id,
      date: isoDate(SEASON_YEAR, month, day),
      acres: field.acreage,
      fertilizer_formula: pick(FERTILIZER_FORMULAS),
      season_year: SEASON_YEAR,
    };
  });
}

export function generateGrainMovements(bins: Bin[], fields: Field[], count = 100): (Omit<GrainMovement, 'id'> & { timestamp?: number })[] {
  return Array.from({ length: count }, () => {
    const bin = pick(bins);
    const type = pick(['in', 'in', 'in', 'out']) as 'in' | 'out';
    const field = pick(fields);
    const month = randInt(9, 12);
    const day = randInt(1, 28);

    return {
      binId: bin.id,
      binName: bin.name,
      type,
      bushels: randInt(100, 1500),
      moisturePercent: randFloat(12, 20, 1),
      sourceFieldName: type === 'in' ? field.name : undefined,
      destination: type === 'out' ? pick(DESTINATIONS_SELL) : undefined,
      price: type === 'out' ? randFloat(4.0, 7.5, 2) : undefined,
      timestamp: new Date(SEASON_YEAR, month - 1, day, randInt(7, 18)).getTime(),
      seasonYear: SEASON_YEAR,
    };
  });
}

// --- Master Seed Function ---

export interface SeedResult {
  fields: Field[];
  bins: Bin[];
  seeds: SavedSeed[];
  recipes: Omit<SprayRecipe, 'id'>[];
  plantRecords: Omit<PlantRecord, 'id' | 'timestamp'>[];
  sprayRecords: Omit<SprayRecord, 'id' | 'timestamp'>[];
  harvestRecords: Omit<HarvestRecord, 'id' | 'timestamp'>[];
  hayRecords: Omit<HayHarvestRecord, 'id' | 'timestamp'>[];
  fertilizerRecords: Omit<FertilizerApplication, 'id' | 'created_at' | 'updated_at' | 'fieldName'>[];
  grainMovements: (Omit<GrainMovement, 'id'> & { timestamp?: number })[];
}

export function generateAllTestData(count = 100): SeedResult {
  const fields = generateFields(count);
  const bins = generateBins(count);
  const seeds = generateSavedSeeds(count);
  const recipes = generateSprayRecipes(count);
  const plantRecords = generatePlantRecords(fields, seeds, count);
  const sprayRecords = generateSprayRecords(fields, count);
  const harvestRecords = generateHarvestRecords(fields, bins, count);
  const hayRecords = generateHayRecords(fields, count);
  const fertilizerRecords = generateFertilizerRecords(fields, count);
  const grainMovements = generateGrainMovements(bins, fields, count);

  return {
    fields, bins, seeds, recipes,
    plantRecords, sprayRecords, harvestRecords,
    hayRecords, fertilizerRecords, grainMovements,
  };
}
