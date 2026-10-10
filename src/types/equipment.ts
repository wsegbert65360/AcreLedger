export type EquipmentKind =
  | 'tractor'
  | 'combine'
  | 'sprayer'
  | 'planter'
  | 'tillage'
  | 'truck'
  | 'implement'
  | 'other';

export type MeterUnit = 'hours' | 'miles' | 'km';
export type EquipmentStatus = 'active' | 'sold' | 'retired';
export type MaintenanceLogKind = 'service' | 'repair';

export interface Equipment {
  id: string;
  farm_id: string;
  kind: EquipmentKind;
  year?: number;
  make?: string;
  model?: string;
  serialNumber?: string;
  meterUnit: MeterUnit;
  currentReading: number;
  readingUpdatedAt?: string;
  status: EquipmentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deleted_at: string | null;
}

export interface MaintenanceSchedule {
  id: string;
  farm_id: string;
  equipmentId: string;
  taskName: string;
  intervalValue?: number;
  intervalDays?: number;
  lastDoneReading?: number;
  lastDoneAt?: string;
  createdAt: string;
  updatedAt: string;
  deleted_at: string | null;
}

export interface MaintenanceLog {
  id: string;
  farm_id: string;
  equipmentId: string;
  scheduleId?: string;
  kind: MaintenanceLogKind;
  performedOn: string;
  readingAtService?: number;
  description?: string;
  performedBy?: string;
  vendor?: string;
  costParts?: number;
  costLabor?: number;
  createdAt: string;
  updatedAt: string;
  deleted_at: string | null;
}

export interface EquipmentRow {
  id: string;
  farm_id: string;
  kind: EquipmentKind;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  serial_number?: string | null;
  meter_unit: MeterUnit;
  current_reading: number | string;
  reading_updated_at?: string | null;
  status: EquipmentStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface MaintenanceScheduleRow {
  id: string;
  farm_id: string;
  equipment_id: string;
  task_name: string;
  interval_value?: number | string | null;
  interval_days?: number | null;
  last_done_reading?: number | string | null;
  last_done_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface MaintenanceLogRow {
  id: string;
  farm_id: string;
  equipment_id: string;
  schedule_id?: string | null;
  kind: MaintenanceLogKind;
  performed_on: string;
  reading_at_service?: number | string | null;
  description?: string | null;
  performed_by?: string | null;
  vendor?: string | null;
  cost_parts?: number | string | null;
  cost_labor?: number | string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}
