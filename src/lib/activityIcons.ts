import { Leaf, Cloud, Sprout, Tractor, Wheat, Package, type LucideIcon } from 'lucide-react';

export type ActivityType =
  | 'plant'
  | 'spray'
  | 'customSpray'
  | 'fertilizer'
  | 'tillage'
  | 'harvest'
  | 'hay'
  | 'grain';

export const ACTIVITY_ICONS: Record<ActivityType, LucideIcon> = {
  plant: Leaf,
  spray: Cloud,
  customSpray: Cloud,
  fertilizer: Sprout,
  tillage: Tractor,
  harvest: Wheat,
  hay: Package,
  grain: Wheat,
};

export const ACTIVITY_TEXT_COLORS: Record<ActivityType, string> = {
  plant: 'text-plant',
  spray: 'text-spray',
  customSpray: 'text-spray',
  fertilizer: 'text-lime-600 dark:text-lime-400',
  tillage: 'text-orange-600',
  harvest: 'text-harvest',
  hay: 'text-harvest',
  grain: 'text-harvest',
};

export const ACTIVITY_BG_COLORS: Record<ActivityType, string> = {
  plant: 'bg-plant/10',
  spray: 'bg-spray/10',
  customSpray: 'bg-spray/10',
  fertilizer: 'bg-lime-500/10',
  tillage: 'bg-orange-600/10',
  harvest: 'bg-harvest/10',
  hay: 'bg-harvest/10',
  grain: 'bg-harvest/10',
};
