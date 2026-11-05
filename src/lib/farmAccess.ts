import { getFarmBillingAccess } from '@/lib/billing';
import { isFarmComped } from '@/lib/farmTrial';
import type { FarmCompStatus } from '@/types/database';
import type { FarmSubscription } from '@/types/farm';

/**
 * Read-only mode decision for a farm (client-side gate, off by default).
 *
 * The Terms and Refund Policy say an unpaid farm becomes read-only: records
 * stay viewable and exportable, but nothing new can be added or changed.
 * Every rule here fails open: unknown or missing billing data never locks a
 * farm, so absent data cannot become an accidental paywall.
 */

/** Only `VITE_BILLING_ENFORCE=true` turns read-only mode on. */
export function isBillingEnforced(env: Record<string, string | undefined> | undefined): boolean {
  return env?.VITE_BILLING_ENFORCE === 'true';
}

export type FarmAccessReason =
  | 'not-enforced'
  | 'unknown'
  | 'comped'
  | 'subscribed'
  | 'trial'
  | 'no-trial-date'
  | 'trial-ended'
  | 'subscription-ended';

export interface FarmAccessState {
  readOnly: boolean;
  reason: FarmAccessReason;
}

export const FULL_ACCESS: FarmAccessState = { readOnly: false, reason: 'not-enforced' };

export interface FarmAccessInputs {
  enforce: boolean;
  /** False until the farm, comp, and subscription reads have all succeeded. */
  loaded: boolean;
  trialEndsAt: string | null | undefined;
  comp: FarmCompStatus | null | undefined;
  /** The farm's live (non-deleted) `farm_subscriptions` row, if any. */
  subscription: FarmSubscription | null | undefined;
  nowMs?: number;
}

export function getFarmAccessState(inputs: FarmAccessInputs): FarmAccessState {
  if (!inputs.enforce) return FULL_ACCESS;
  if (!inputs.loaded) return { readOnly: false, reason: 'unknown' };

  const nowMs = inputs.nowMs ?? Date.now();
  if (isFarmComped(inputs.comp, nowMs)) return { readOnly: false, reason: 'comped' };

  const subscription = inputs.subscription && inputs.subscription.deleted_at == null ? inputs.subscription : null;
  if (subscription && getFarmBillingAccess({ subscription, nowMs, enforce: true }).hasAccess) {
    return { readOnly: false, reason: 'subscribed' };
  }

  const trialEndMs = inputs.trialEndsAt ? Date.parse(inputs.trialEndsAt) : NaN;
  if (Number.isFinite(trialEndMs) && trialEndMs > nowMs) return { readOnly: false, reason: 'trial' };

  // A lapsed subscription locks even if the trial date is missing.
  if (subscription) return { readOnly: true, reason: 'subscription-ended' };

  // Farms that were never stamped with a trial await the rollout backfill.
  if (!Number.isFinite(trialEndMs)) return { readOnly: false, reason: 'no-trial-date' };

  return { readOnly: true, reason: 'trial-ended' };
}

/** Value a blocked store action returns, matching each action's failure shape. */
export const READ_ONLY_FAILURE_VALUES = {
  updateGrainMovementWithVersion: false,
  updateEquipmentReading: 'failed',
} as const;

/**
 * Farm store actions that change farm data. Read-only mode blocks exactly
 * these; reading, exporting, syncing already-queued changes, sign-out, and
 * account deletion stay available.
 */
export const READ_ONLY_BLOCKED_ACTIONS = [
  'rolloverToNewSeason',
  'addPlantRecord', 'updatePlantRecord', 'deletePlantRecords',
  'addSprayRecord', 'updateSprayRecord', 'deleteSprayRecords',
  'addHarvestRecord', 'addHarvestWithGrain', 'updateHarvestRecord', 'deleteHarvestRecords',
  'addHayHarvestRecord', 'updateHayHarvestRecord', 'deleteHayHarvestRecords',
  'addCustomSprayRecord', 'updateCustomSprayRecord', 'deleteCustomSprayRecords',
  'addFertilizerApplication', 'updateFertilizerApplication', 'deleteFertilizerApplications',
  'addTillageRecord', 'updateTillageRecord', 'deleteTillageRecords',
  'addGrainMovement', 'updateGrainMovement', 'updateGrainMovementWithVersion', 'deleteGrainMovements',
  'addField', 'updateField', 'flushFieldNotes', 'deleteField',
  'addBin', 'updateBin', 'deleteBin',
  'addSeed', 'deleteSeed',
  'addSprayRecipe', 'updateSprayRecipe', 'deleteSprayRecipe',
  'addFertilizerRecipe', 'updateFertilizerRecipe', 'deleteFertilizerRecipe',
  'updateFarmName',
  'restoreFromBackup',
  'importTract', 'deleteTract', 'assignClu', 'updateCluLandUse', 'unassignClu',
  'addWorkRequest', 'updateWorkRequest', 'deleteWorkRequests',
  'addEquipment', 'updateEquipment', 'updateEquipmentReading', 'setEquipmentMeterUnit', 'deleteEquipment',
  'addMaintenanceSchedule', 'updateMaintenanceSchedule', 'deleteMaintenanceSchedule',
  'logMaintenance', 'updateMaintenanceLog', 'deleteMaintenanceLog',
] as const;

export type ReadOnlyBlockedAction = typeof READ_ONLY_BLOCKED_ACTIONS[number];

export const READ_ONLY_TOAST_ID = 'farm-read-only';
export const READ_ONLY_MESSAGE = 'This farm is view-only. You can still view and export your records.';
