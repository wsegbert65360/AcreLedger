import { Capacitor } from '@capacitor/core';
import { native } from '@/lib/native';
import type { Equipment, MaintenanceLog } from '@/types/equipment';
import { sanitizeCsvValue } from '@/utils/csv';

export function buildMaintenanceCsv(logs: MaintenanceLog[], equipment: Equipment[]): string {
  const machineById = new Map(equipment.map(machine => [machine.id, machine]));
  const rows = logs
    .filter(log => !log.deleted_at)
    .sort((a, b) => b.performedOn.localeCompare(a.performedOn))
    .map(log => {
      const machine = machineById.get(log.equipmentId);
      return [
        log.performedOn,
        machine ? [machine.year, machine.make, machine.model].filter(Boolean).join(' ') : log.equipmentId,
        log.kind,
        log.readingAtService,
        machine?.meterUnit,
        log.description,
        log.performedBy,
        log.vendor,
        log.costParts,
        log.costLabor,
        (log.costParts ?? 0) + (log.costLabor ?? 0),
      ].map(value => sanitizeCsvValue(value as string | number | null | undefined)).join(',');
    });
  return [
    'Date,Equipment,Type,Meter Reading,Meter Unit,Description,Performed By,Vendor,Parts Cost,Labor Cost,Total Cost',
    ...rows,
  ].join('\r\n');
}

export async function exportMaintenanceCsv(
  logs: MaintenanceLog[],
  equipment: Equipment[],
  fileName: string,
): Promise<void> {
  const csv = buildMaintenanceCsv(logs, equipment);
  if (Capacitor.isNativePlatform()) {
    await native.shareFile({ fileName, data: csv, title: 'AcreLedger equipment maintenance', encoding: 'utf8' });
    return;
  }
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
