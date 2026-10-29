import { cn } from '@/lib/utils';
import type { Equipment, EquipmentKind, EquipmentStatus, MeterUnit } from '@/types/equipment';
import { formatIsoDate } from '@/utils/dates';

const KIND_LABEL: Record<EquipmentKind, string> = {
  tractor: 'Tractor',
  combine: 'Combine',
  sprayer: 'Sprayer',
  planter: 'Planter',
  tillage: 'Tillage',
  truck: 'Truck',
  implement: 'Implement',
  other: 'Other',
};

const STATUS_LABEL: Record<EquipmentStatus, string> = {
  active: 'Active',
  sold: 'Sold',
  retired: 'Retired',
};

const METER_UNIT_LABEL: Record<MeterUnit, string> = {
  hours: 'Hours',
  miles: 'Miles',
  km: 'km',
};

interface EquipmentDetailItem {
  label: string;
  value: string;
  wide?: boolean;
  mono?: boolean;
  preserveLines?: boolean;
}

function presentText(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatTimestamp(value: string | null | undefined): string | undefined {
  const text = presentText(value);
  if (!text) return undefined;
  return formatIsoDate(text, 'en-US') || text;
}

/**
 * Saved equipment columns a farmer can read. `model` is the model / model
 * number (there is no separate model_number column) and `notes` is the memo.
 * Internal ids stay off this list; a null deleted_at is an empty field.
 */
function equipmentDetailItems(machine: Equipment): EquipmentDetailItem[] {
  const items: EquipmentDetailItem[] = [];
  const add = (
    label: string,
    value: string | undefined,
    options?: Pick<EquipmentDetailItem, 'wide' | 'mono' | 'preserveLines'>,
  ) => {
    if (value == null || value.trim() === '') return;
    items.push({ label, value, ...options });
  };

  add('Make', presentText(machine.make));
  add('Model', presentText(machine.model), { mono: true });
  add('Serial number', presentText(machine.serialNumber), { mono: true, wide: true });
  if (typeof machine.year === 'number' && Number.isFinite(machine.year)) {
    add('Year', String(machine.year), { mono: true });
  }
  add('Notes', presentText(machine.notes), { wide: true, preserveLines: true });
  add('Kind', KIND_LABEL[machine.kind] ?? machine.kind);
  add('Status', STATUS_LABEL[machine.status] ?? machine.status);
  add('Meter unit', METER_UNIT_LABEL[machine.meterUnit] ?? machine.meterUnit);
  if (Number.isFinite(machine.currentReading)) {
    add('Current reading', machine.currentReading.toLocaleString(), { mono: true });
  }
  add('Reading updated', formatTimestamp(machine.readingUpdatedAt), { mono: true });
  add('Added', formatTimestamp(machine.createdAt), { mono: true });
  add('Last saved', formatTimestamp(machine.updatedAt), { mono: true });
  return items;
}

export default function EquipmentDetails({ machine }: { machine: Equipment }) {
  const items = equipmentDetailItems(machine);
  if (items.length === 0) return null;

  return (
    <section aria-label="Equipment details" className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="font-bold">Details</h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {items.map(item => (
          <div key={item.label} className={cn('min-w-0', item.wide && 'sm:col-span-2')}>
            <dt className="text-xs font-semibold text-muted-foreground">{item.label}</dt>
            <dd
              className={cn(
                'break-words text-sm font-medium text-foreground',
                item.mono && 'font-mono',
                item.preserveLines && 'whitespace-pre-wrap',
              )}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
