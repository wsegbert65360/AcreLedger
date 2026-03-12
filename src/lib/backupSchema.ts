import { z } from 'zod';

export const backupSchema = z.object({
  fields: z.array(z.any()).optional(),
  bins: z.array(z.any()).optional(),
  plantRecords: z.array(z.any()).optional(),
  sprayRecords: z.array(z.any()).optional(),
  harvestRecords: z.array(z.any()).optional(),
  hayHarvestRecords: z.array(z.any()).optional(),
  fertilizerApplications: z.array(z.any()).optional(),
  grainMovements: z.array(z.any()).optional(),
  savedSeeds: z.array(z.any()).optional(),
  sprayRecipes: z.array(z.any()).optional(),
  activeSeason: z.number().optional(),
  rolloverDate: z.string().optional(),
}).passthrough();

export type BackupData = z.infer<typeof backupSchema>;
