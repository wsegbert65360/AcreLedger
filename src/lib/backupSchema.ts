import { z } from 'zod';

export const backupSchema = z.object({
  fields: z.array(z.record(z.unknown())).optional(),
  bins: z.array(z.record(z.unknown())).optional(),
  plantRecords: z.array(z.record(z.unknown())).optional(),
  sprayRecords: z.array(z.record(z.unknown())).optional(),
  harvestRecords: z.array(z.record(z.unknown())).optional(),
  hayHarvestRecords: z.array(z.record(z.unknown())).optional(),
  fertilizerApplications: z.array(z.record(z.unknown())).optional(),
  tillageRecords: z.array(z.record(z.unknown())).optional(),
  grainMovements: z.array(z.record(z.unknown())).optional(),
  savedSeeds: z.array(z.record(z.unknown())).optional(),
  fertilizerRecipes: z.array(z.record(z.unknown())).optional(),
  sprayRecipes: z.array(z.record(z.unknown())).optional(),
  activeSeason: z.number().optional(),
  rolloverDate: z.string().optional(),
}).passthrough();

export type BackupData = z.infer<typeof backupSchema>;
