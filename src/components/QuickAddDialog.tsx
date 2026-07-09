import { useEffect, useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useFarm } from '@/store/farmStore';
import { useQuickAdd, QuickAddActivityType } from '@/context/QuickAddContext';
import { native } from '@/lib/native';
import { ACTIVITY_ICONS, ACTIVITY_TEXT_COLORS, ACTIVITY_BG_COLORS } from '@/lib/activityIcons';
import { Loader2, Navigation, ClipboardList } from 'lucide-react';
import SprayTypeChooser from '@/components/SprayTypeChooser';

// Using squared Euclidean distance as a fast, monotonic metric for local field comparison (farm scale only).
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  return dLat * dLat + dLon * dLon;
};

export default function QuickAddDialog() {
  const {
    isQuickAddOpen,
    preselectedType,
    closeQuickAdd,
    setActiveModal,
    setSelectedField
  } = useQuickAdd();

  const {
    session,
    fields,
    plantRecords,
    sprayRecords,
    harvestRecords,
    hayHarvestRecords,
    customSprayRecords,
    fertilizerApplications,
    tillageRecords
  } = useFarm();

  const [step, setStep] = useState<'activity' | 'field'>('activity');
  const [selectedType, setSelectedType] = useState<QuickAddActivityType | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string>('');

  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsFieldId, setGpsFieldId] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState(false);
  const [showSprayChooser, setShowSprayChooser] = useState(false);

  const hasManuallySelectedFieldRef = useRef(false);
  const hasInitializedRef = useRef(false);

  // Active fields list (excluding deleted)
  const activeFields = useMemo(() => {
    return fields.filter(f => !f.deleted_at).sort((a, b) => a.name.localeCompare(b.name));
  }, [fields]);

  // Track the last used field across all activity types
  const lastUsedFieldId = useMemo(() => {
    const allRecords: { timestamp: number; fieldId: string }[] = [];
    plantRecords.forEach(r => { if (!r.deleted_at && r.fieldId) allRecords.push({ timestamp: r.timestamp, fieldId: r.fieldId }); });
    sprayRecords.forEach(r => { if (!r.deleted_at && r.fieldId) allRecords.push({ timestamp: r.timestamp, fieldId: r.fieldId }); });
    harvestRecords.forEach(r => { if (!r.deleted_at && r.fieldId) allRecords.push({ timestamp: r.timestamp, fieldId: r.fieldId }); });
    hayHarvestRecords.forEach(r => { if (!r.deleted_at && r.fieldId) allRecords.push({ timestamp: r.timestamp, fieldId: r.fieldId }); });
    fertilizerApplications.forEach(r => { if (!r.deleted_at && r.fieldId) allRecords.push({ timestamp: r.timestamp, fieldId: r.fieldId }); });
    tillageRecords.forEach(r => { if (!r.deleted_at && r.fieldId) allRecords.push({ timestamp: r.timestamp, fieldId: r.fieldId }); });
    customSprayRecords.forEach(r => { if (!r.deleted_at && r.fieldId) allRecords.push({ timestamp: r.timestamp, fieldId: r.fieldId }); });

    if (allRecords.length === 0) return null;
    allRecords.sort((a, b) => b.timestamp - a.timestamp);
    return allRecords[0].fieldId;
  }, [plantRecords, sprayRecords, harvestRecords, hayHarvestRecords, customSprayRecords, fertilizerApplications, tillageRecords]);

  // Stable primitive signature of the active-fields list. farmStore recreates
  // these arrays on every fetchData()/reconnect, so depending on `activeFields`
  // directly would re-fire effects (and re-trigger the GPS lookup) on every
  // background refresh. The signature only changes when the actual field set or
  // order changes. (AGENTS.md: effect deps must be primitives, not store entity
  // array refs.)
  const activeFieldsKey = activeFields.map(f => f.id).join(',');
  // Keep the latest array in a ref so the GPS effect can read it without
  // depending on its identity.
  const activeFieldsRef = useRef(activeFields);
  activeFieldsRef.current = activeFields;

  // Reset dialog state when opened or closed
  useEffect(() => {
    if (!isQuickAddOpen) {
      hasInitializedRef.current = false;
      return;
    }

    if (isQuickAddOpen && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setGpsFieldId(null);
      setGpsError(false);
      setGpsLoading(false);
      hasManuallySelectedFieldRef.current = false;

      if (preselectedType) {
        setSelectedType(preselectedType);
        setStep('field');
      } else {
        setSelectedType(null);
        setStep('activity');
      }

      // Initial field selection priority:
      // 1. Last used field
      // 2. First alphabetical field
      const currentFields = activeFieldsRef.current;
      if (lastUsedFieldId && currentFields.some(f => f.id === lastUsedFieldId)) {
        setSelectedFieldId(lastUsedFieldId);
      } else if (currentFields.length > 0) {
        setSelectedFieldId(currentFields[0].id);
      }
    }
    // lastUsedFieldId is a string|null primitive; activeFieldsKey captures the
    // fields set without the array identity churn.
  }, [isQuickAddOpen, preselectedType, lastUsedFieldId, activeFieldsKey]);

  // GPS nearest field lookup
  useEffect(() => {
    let active = true;

    if (isQuickAddOpen && step === 'field') {
      const currentFields = activeFieldsRef.current;
      if (currentFields.length > 0) {
        setGpsLoading(true);
        setGpsError(false);

        native.geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 })
          .then((pos) => {
            if (!active) return;
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            let nearestFieldId: string | null = null;
            let minDistance = Infinity;

            currentFields.forEach((f) => {
              if (f.lat != null && f.lng != null) {
                const dist = getDistance(lat, lng, f.lat, f.lng);
                if (dist < minDistance) {
                  minDistance = dist;
                  nearestFieldId = f.id;
                }
              }
            });

            if (nearestFieldId) {
              setGpsFieldId(nearestFieldId);
              if (!hasManuallySelectedFieldRef.current) {
                setSelectedFieldId(nearestFieldId);
                native.haptic.light();
              }
            }
            setGpsLoading(false);
          })
          .catch((err) => {
            if (!active) return;
            console.warn('[QuickAdd] GPS nearest field lookup failed:', err);
            setGpsError(true);
            setGpsLoading(false);
          });
      }
    }

    return () => {
      active = false;
    };
  }, [isQuickAddOpen, step, activeFieldsKey]);

  const handleSelectActivity = (type: QuickAddActivityType) => {
    native.haptic.light();
    setSelectedType(type);
    setStep('field');
  };

  const handleStartActivity = () => {
    if (!selectedType || !selectedFieldId) return;

    const fieldObj = activeFields.find(f => f.id === selectedFieldId);
    if (!fieldObj) return;

    native.haptic.medium();
    setSelectedField(fieldObj);
    if (selectedType === 'spray') {
      // Ask whether this is a full spray entry or a custom (outside-party) spray.
      setShowSprayChooser(true);
      return;
    }
    setActiveModal(selectedType);
    closeQuickAdd();
  };

  const beginSprayEntry = (type: 'spray' | 'customSpray') => {
    setShowSprayChooser(false);
    setActiveModal(type);
    closeQuickAdd();
  };

  const ACTIVITIES: { key: QuickAddActivityType; label: string; icon: React.ElementType; colorClass: string; bgClass: string }[] = [
    { key: 'plant', label: 'Planting', icon: ACTIVITY_ICONS.plant, colorClass: ACTIVITY_TEXT_COLORS.plant, bgClass: ACTIVITY_BG_COLORS.plant },
    { key: 'spray', label: 'Spraying', icon: ACTIVITY_ICONS.spray, colorClass: ACTIVITY_TEXT_COLORS.spray, bgClass: ACTIVITY_BG_COLORS.spray },
    { key: 'fertilizer', label: 'Fertilizing', icon: ACTIVITY_ICONS.fertilizer, colorClass: ACTIVITY_TEXT_COLORS.fertilizer, bgClass: ACTIVITY_BG_COLORS.fertilizer },
    { key: 'tillage', label: 'Tillage', icon: ACTIVITY_ICONS.tillage, colorClass: ACTIVITY_TEXT_COLORS.tillage, bgClass: ACTIVITY_BG_COLORS.tillage },
    { key: 'harvest', label: 'Harvesting', icon: ACTIVITY_ICONS.harvest, colorClass: ACTIVITY_TEXT_COLORS.harvest, bgClass: ACTIVITY_BG_COLORS.harvest },
    { key: 'hay', label: 'Hay Forage', icon: ACTIVITY_ICONS.hay, colorClass: ACTIVITY_TEXT_COLORS.hay, bgClass: ACTIVITY_BG_COLORS.hay },
  ];

  const chooserField = activeFields.find(f => f.id === selectedFieldId) ?? null;

  return (
    <>
    <Dialog open={isQuickAddOpen} onOpenChange={(open) => { if (!open) closeQuickAdd(); }}>
      <DialogContent className="max-w-md w-[92vw] rounded-2xl bg-card border border-border p-5">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <ClipboardList size={18} className="text-primary" />
            Quick Add Record
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {step === 'activity' ? 'Choose the type of farm activity you want to log.' : 'Select the target field for this activity.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'activity' ? (
          <div className="grid grid-cols-2 gap-3 py-4">
            {ACTIVITIES.map((act) => {
              const Icon = act.icon;
              return (
                <button
                  key={act.key}
                  onClick={() => handleSelectActivity(act.key)}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border border-border/50 ${act.bgClass} hover:bg-muted/20 active:scale-95 transition-all text-center gap-2`}
                >
                  <div className={`w-10 h-10 rounded-full ${act.bgClass} border border-border/10 flex items-center justify-center`}>
                    <Icon size={20} className={act.colorClass} />
                  </div>
                  <span className="text-xs font-bold text-foreground">{act.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="quickAddField" className="text-xs font-mono text-muted-foreground uppercase">Target Field</Label>
                {gpsLoading && (
                  <span className="text-[10px] text-primary flex items-center gap-1 font-mono">
                    <Loader2 size={10} className="animate-spin" /> GPS LOOKUP...
                  </span>
                )}
                {gpsFieldId && (
                  <span className="text-[10px] text-plant font-bold flex items-center gap-1 font-mono">
                    <Navigation size={10} className="fill-current animate-pulse" /> GPS DETECTED
                  </span>
                )}
                {gpsError && !gpsLoading && (
                  <span className="text-[10px] text-muted-foreground font-mono">GPS UNAVAILABLE</span>
                )}
              </div>
              <Select value={selectedFieldId} onValueChange={(val) => {
                hasManuallySelectedFieldRef.current = true;
                setSelectedFieldId(val);
              }}>
                <SelectTrigger id="quickAddField" className="h-11 bg-muted border-border text-sm">
                  <SelectValue placeholder="Select a field" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {activeFields.map(f => {
                    const isGpsNearest = f.id === gpsFieldId;
                    const isLastUsed = f.id === lastUsedFieldId;
                    return (
                      <SelectItem key={f.id} value={f.id} className="text-sm">
                        <div className="flex items-center justify-between w-full gap-2">
                          <span>{f.name} <span className="text-xs text-muted-foreground font-mono">({f.acreage} ac)</span></span>
                          {isGpsNearest && (
                            <span className="ml-2 bg-plant/10 text-plant border border-plant/20 text-[9px] px-1.5 py-0.5 rounded-full font-bold">NEAREST</span>
                          )}
                          {!isGpsNearest && isLastUsed && (
                            <span className="ml-2 bg-primary/10 text-primary border border-primary/20 text-[9px] px-1.5 py-0.5 rounded-full font-bold">RECENT</span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="flex flex-row gap-2 pt-2 sm:justify-end">
              {!preselectedType && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('activity')}
                  className="flex-1 sm:flex-initial h-11 text-xs font-bold"
                >
                  Back
                </Button>
              )}
              <Button
                type="button"
                onClick={handleStartActivity}
                className="flex-grow sm:flex-initial bg-primary hover:bg-primary/90 text-primary-foreground h-11 text-xs font-bold"
                disabled={!selectedFieldId}
              >
                Log {ACTIVITIES.find(a => a.key === selectedType)?.label || 'Activity'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
    {showSprayChooser && chooserField && (
      <SprayTypeChooser
        open={showSprayChooser}
        field={chooserField}
        userPrefix={session?.user?.id ?? null}
        onChoose={beginSprayEntry}
        onCancel={() => setShowSprayChooser(false)}
      />
    )}
    </>
  );
}
