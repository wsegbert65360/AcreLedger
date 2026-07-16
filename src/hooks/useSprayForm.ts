import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Field, SprayRecipeProduct, SprayRecord } from '@/types/farm';
import { WeatherService } from '@/services/WeatherService';
import { WeatherData } from '@/types/weather';
import { useFarm } from '@/store/farmStore';
import { native } from '@/lib/native';
import { toast } from 'sonner';
import { calculateTotalAmount } from '@/utils/unitConversion';
import { getDisplayFieldAcres } from '@/lib/fieldAcreage';
import { getLatestForField } from '@/lib/utils';

export type SprayWizardStep = 'core' | 'mix' | 'conditions' | 'review';

const WIZARD_STEPS: SprayWizardStep[] = ['core', 'mix', 'conditions', 'review'];

interface UseSprayFormProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: SprayRecord;
  mode?: 'edit' | 'duplicate';
}

function createEmptyProduct(): SprayRecipeProduct {
  return {
    ui_id: crypto.randomUUID(),
    product: '',
    rate: '',
    rateUnit: 'oz/ac',
    epaRegNumber: '',
    activeIngredients: '',
    totalProductAmount: '',
    totalProductUnit: 'gal'
  };
}

function normalizeProducts(initial?: SprayRecord): SprayRecipeProduct[] {
  const raw = initial?.products;
  if (!raw || raw.length === 0) return [createEmptyProduct()];
  return raw.map(p => ({
    ...p,
    ui_id: p.ui_id || crypto.randomUUID(),
    epaRegNumber: p.epaRegNumber || '',
    activeIngredients: p.activeIngredients || '',
    totalProductAmount: p.totalProductAmount || '',
    totalProductUnit: p.totalProductUnit || 'gal'
  }));
}

export function useSprayForm({ field, open, onClose, initialData, mode = 'edit' }: UseSprayFormProps) {
  const isDuplicate = mode === 'duplicate' && !!initialData;
  const { addSprayRecord, updateSprayRecord, addSprayRecipe, sprayRecipes, sprayRecords, session, viewingSeason, cluAssignments } = useFarm();
  const userPrefix = session?.user?.id?.slice(0, 8) || 'local';
  const displayFieldAcres = getDisplayFieldAcres(field, cluAssignments);

  const initialDataRef = useRef(initialData);
  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  // Utility to extract attachment from notes
  const extractAttachment = useCallback((notesStr: string) => {
    const match = notesStr.match(/\[ATTACHMENT:(data:image\/[^;]+;base64,([^\]]+))\]/);
    if (match) {
      return {
        cleanNotes: notesStr.replace(/\[ATTACHMENT:[^\]]+\]/, '').trim(),
        dataUri: match[1],
        base64: match[2],
        type: match[1].split(';')[0].replace('data:', '')
      };
    }
    return { cleanNotes: notesStr, dataUri: '', base64: '', type: '' };
  }, []);

  // Wizard navigation & quick mode
  const [step, setStep] = useState<SprayWizardStep>('core');
  const stepIndex = WIZARD_STEPS.indexOf(step);
  const [isQuickMode, setIsQuickMode] = useState(() => localStorage.getItem('al_spray_quick_mode') === 'true');

  useEffect(() => {
    localStorage.setItem('al_spray_quick_mode', String(isQuickMode));
  }, [isQuickMode]);

  // Form state
  const [products, setProducts] = useState<SprayRecipeProduct[]>(() => normalizeProducts(initialData));
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [applicatorName, setApplicatorName] = useState(() => initialData?.applicatorName || localStorage.getItem(`al_applicator_name_${userPrefix}`) || '');
  const [licenseNumber, setLicenseNumber] = useState(() => initialData?.licenseNumber || localStorage.getItem(`al_license_number_${userPrefix}`) || '');
  const [targetPest, setTargetPest] = useState(initialData?.targetPest || 'grass/broadleaves');
  const [sprayDate, setSprayDate] = useState(initialData?.sprayDate || new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(() => initialData?.startTime || new Date().toTimeString().slice(0, 5));
  const [endTime, setEndTime] = useState(initialData?.endTime || '');
  const [isEndTimeManual, setIsEndTimeManual] = useState(!!initialData?.endTime);
  const [involvedTechnicians, setInvolvedTechnicians] = useState(initialData?.involvedTechnicians || '');
  const [siteAddress, setSiteAddress] = useState(initialData?.siteAddress || field.name);
  const [treatedAreaSize, setTreatedAreaSizeState] = useState(initialData?.treatedAreaSize?.toString() || displayFieldAcres.toString() || '');
  const treatedAreaEditedRef = useRef(false);
  const setTreatedAreaSize = useCallback((value: string) => {
    treatedAreaEditedRef.current = true;
    setTreatedAreaSizeState(value);
  }, []);
  const [treatedAreaUnit, setTreatedAreaUnit] = useState(initialData?.treatedAreaUnit || 'ac');
  const [totalAmountApplied, setTotalAmountApplied] = useState(initialData?.totalAmountApplied?.toString() || '');
  const [mixtureRate, setMixtureRate] = useState(initialData?.mixtureRate || '');
  const [totalMixtureVolume, setTotalMixtureVolume] = useState(initialData?.totalMixtureVolume || '');
  const [equipmentId, setEquipmentId] = useState(() => initialData?.equipmentId || localStorage.getItem(`al_equipment_id_${userPrefix}`) || 'Miller Nitro');
  const [manualWindDirection, setManualWindDirection] = useState<string>(initialData?.windDirection || '');
  const [manualWindSpeed, setManualWindSpeed] = useState<string>(initialData?.windSpeed?.toString() || '');
  const [isPremixed, setIsPremixed] = useState(initialData?.isPremixed || false);
  const [cropOrSiteTreated, setCropOrSiteTreated] = useState(initialData?.cropOrSiteTreated || '');
  const [applicationMethod, setApplicationMethod] = useState(initialData?.applicationMethod || 'Ground Broadcast');
  const [rei, setRei] = useState(initialData?.rei || '12h');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [photoBase64, setPhotoBase64] = useState('');
  const [photoType, setPhotoType] = useState('');
  const [sensitiveAreaCheck, setSensitiveAreaCheck] = useState(initialData?.sensitiveAreaCheck || false);
  const [sensitiveAreaNotes, setSensitiveAreaNotes] = useState(initialData?.sensitiveAreaNotes || '');
  const [complianceProfile] = useState(initialData?.complianceProfile || 'universal');

  // Async / UI state
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const hasSeenIncompleteWarning = useRef(false);

  // Save-as-recipe dialog state
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const closeAfterRecipeDialogRef = useRef(false);
  const pendingRecipeRef = useRef<{
    products: { product: string; rate: string; rateUnit: string; epaRegNumber?: string; activeIngredients?: string }[];
    applicatorName: string;
    licenseNumber: string;
    targetPest: string;
  } | null>(null);

  const suggestedSpray = useMemo(() => {
    if (initialData) return null;
    return getLatestForField(sprayRecords, field.id, 'sprayDate', record => record.seasonYear === viewingSeason);
  }, [field.id, initialData, sprayRecords, viewingSeason]);

  // Reset form when modal opens/closes or record changes
  useEffect(() => {
    if (!open) return;

    setShowValidation(false);
    hasSeenIncompleteWarning.current = false;
    treatedAreaEditedRef.current = false;
    setStep('core');
    setSelectedRecipeId('');

    if (initialData) {
      setProducts(normalizeProducts(initialData));
      setApplicatorName(initialData.applicatorName || '');
      setLicenseNumber(initialData.licenseNumber || '');
      setTargetPest(initialData.targetPest || 'grass/broadleaves');
      setSprayDate(isDuplicate ? new Date().toISOString().split('T')[0] : (initialData.sprayDate || new Date().toISOString().split('T')[0]));
      setStartTime(initialData.startTime || '');
      setEndTime(initialData.endTime || '');
      setIsEndTimeManual(!!initialData.endTime);
      setSiteAddress(initialData.siteAddress || field.name);
      setTreatedAreaSizeState(initialData.treatedAreaSize?.toString() || displayFieldAcres.toString() || '');
      setTreatedAreaUnit(initialData.treatedAreaUnit || 'ac');
      setTotalAmountApplied(initialData.totalAmountApplied?.toString() || '');
      setMixtureRate(initialData.mixtureRate || '');
      setTotalMixtureVolume(initialData.totalMixtureVolume || '');
      setInvolvedTechnicians(initialData.involvedTechnicians || '');
      setEquipmentId(initialData.equipmentId || '');
      setManualWindDirection(isDuplicate ? '' : (initialData.windDirection || ''));
      setManualWindSpeed(isDuplicate ? '' : (initialData.windSpeed?.toString() || ''));
      setIsPremixed(initialData.isPremixed || false);
      setCropOrSiteTreated(initialData.cropOrSiteTreated || '');
      setApplicationMethod(initialData.applicationMethod || 'Ground Broadcast');
      setRei(initialData.rei || '12h');
      const parsed = extractAttachment(initialData.notes || '');
      setNotes(parsed.cleanNotes);
      setPhotoBase64(isDuplicate ? '' : parsed.base64);
      setPhotoType(isDuplicate ? '' : parsed.type);

      setSensitiveAreaCheck(initialData.sensitiveAreaCheck || false);
      setSensitiveAreaNotes(initialData.sensitiveAreaNotes || '');

      if (
        !isDuplicate &&
        (initialData.windSpeed !== undefined ||
        initialData.temperature !== undefined ||
        initialData.relativeHumidity !== undefined ||
        initialData.windDirection)
      ) {
        setWeather({
          wind: initialData.windSpeed ?? 0,
          temp: initialData.temperature ?? 0,
          humidity: initialData.relativeHumidity ?? 0,
          windDirection: initialData.windDirection ?? '',
          isError: false
        });
      } else {
        setWeather(null);
      }
    } else {
      const now = new Date();
      setProducts(suggestedSpray ? normalizeProducts(suggestedSpray).map(p => ({ ...p, ui_id: crypto.randomUUID() })) : [createEmptyProduct()]);
      setApplicatorName(suggestedSpray?.applicatorName || localStorage.getItem(`al_applicator_name_${userPrefix}`) || '');
      setLicenseNumber(suggestedSpray?.licenseNumber || localStorage.getItem(`al_license_number_${userPrefix}`) || '');
      setTargetPest(suggestedSpray?.targetPest || 'grass/broadleaves');
      setSprayDate(now.toISOString().split('T')[0]);
      setStartTime(now.toTimeString().slice(0, 5));
      setEndTime('');
      setIsEndTimeManual(false);
      setSiteAddress(field.name);
      setTreatedAreaSizeState(displayFieldAcres.toString() || '');
      setTreatedAreaUnit('ac');
      setTotalAmountApplied('');
      setMixtureRate('');
      setTotalMixtureVolume('');
      setInvolvedTechnicians('');
      setEquipmentId(localStorage.getItem(`al_equipment_id_${userPrefix}`) || 'Miller Nitro');
      setManualWindDirection('');
      setManualWindSpeed('');
      setIsPremixed(false);
      setCropOrSiteTreated('');
      setApplicationMethod('Ground Broadcast');
      setRei('12h');
      setNotes('');
      setSensitiveAreaCheck(false);
      setSensitiveAreaNotes('');
      setWeather(null);
    }
    // Depend only on open/initialData primitives per AGENTS.md (do not depend on `field` object reference).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?.id, isDuplicate]);

  // CLU assignments can finish hydrating after a new-record modal opens. Refresh
  // the default only until the farmer edits it; existing and duplicated records
  // must preserve their explicitly stored treated acreage.
  useEffect(() => {
    if (!open || initialData || treatedAreaEditedRef.current) return;
    setTreatedAreaSizeState(displayFieldAcres.toString() || '');
  }, [open, initialData, displayFieldAcres]);

  // Auto-fetch current weather for new or duplicate records
  useEffect(() => {
    if (open && (!initialData || isDuplicate) && field.lat != null && field.lng != null) {
      setLoading(true);
      WeatherService.fetchCurrentWeather(`${field.lat},${field.lng}`).then(w => {
        if (!w || w.isError) {
          setLoading(false);
          return;
        }
        setWeather(w);
        setManualWindDirection(prev => prev || w.windDirection || 'CALM');
        setManualWindSpeed(prev => prev || String(Number.isFinite(w.wind) ? w.wind : 0));
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    } else if (open) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?.id, field.lat, field.lng, isDuplicate]);

  // Auto-calculate total product amounts and summary total
  const ratesSignature = useMemo(() =>
    products.map(p => `${p.rate}-${p.rateUnit}`).join(','),
    [products]
  );

  useEffect(() => {
    const acres = parseFloat(treatedAreaSize);
    if (isNaN(acres) || acres <= 0) return;

    let firstProductTotal = 0;

    setProducts(prev => {
      let changed = false;
      const next = prev.map((p, i) => {
        const rateValue = parseFloat(p.rate || '0');
        if (isNaN(rateValue) || rateValue <= 0) return p;

        const { value, unit } = calculateTotalAmount(rateValue, acres, p.rateUnit);
        if (i === 0) firstProductTotal = value;

        if (p.totalProductAmount !== value.toString() || p.totalProductUnit !== unit) {
          changed = true;
          return { ...p, totalProductAmount: value.toString(), totalProductUnit: unit };
        }
        return p;
      });
      return changed ? next : prev;
    });

    if (firstProductTotal > 0 && totalAmountApplied !== firstProductTotal.toString()) {
      setTotalAmountApplied(firstProductTotal.toString());
    }
  }, [treatedAreaSize, ratesSignature, totalAmountApplied]);

  // Auto-estimate end time
  useEffect(() => {
    if (isEndTimeManual || !startTime || !treatedAreaSize) return;

    const acres = parseFloat(treatedAreaSize);
    if (isNaN(acres) || acres <= 0) return;

    const [hours, minutes] = startTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return;
    const startMins = hours * 60 + minutes;

    const durationMins = Math.round(acres / (60.6 / 60));
    const endTotalMins = (startMins + durationMins) % (24 * 60);
    const endH = Math.floor(endTotalMins / 60).toString().padStart(2, '0');
    const endM = (endTotalMins % 60).toString().padStart(2, '0');
    const newEndTime = `${endH}:${endM}`;

    setEndTime(prev => (prev !== newEndTime ? newEndTime : prev));
  }, [startTime, treatedAreaSize, isEndTimeManual, open]);

  const updateProduct = useCallback((i: number, key: keyof SprayRecipeProduct, value: string) => {
    setProducts(prev => prev.map((p, idx) => idx === i ? { ...p, [key]: value } : p));
  }, []);

  const addProduct = useCallback(() => {
    setProducts(prev => [...prev, createEmptyProduct()]);
  }, []);

  const removeProduct = useCallback((i: number) => {
    setProducts(prev => prev.filter((_, idx) => idx !== i));
  }, []);

  const handleRecipeSelect = useCallback((recipeId: string) => {
    setSelectedRecipeId(recipeId);
    const recipe = sprayRecipes.find(r => r.id === recipeId);
    if (recipe) {
      setProducts(recipe.products.map(p => ({ ...p, ui_id: crypto.randomUUID(), epaRegNumber: p.epaRegNumber || '' })));
      if (recipe.applicatorName) setApplicatorName(recipe.applicatorName);
      if (recipe.licenseNumber) setLicenseNumber(recipe.licenseNumber);
      if (recipe.targetPest) setTargetPest(recipe.targetPest);
      if (recipe.cropOrSiteTreated) setCropOrSiteTreated(recipe.cropOrSiteTreated);
    }
  }, [sprayRecipes]);

  const handleRecoverWeather = useCallback(async () => {
    if (!field.lat || !field.lng || !sprayDate) {
      toast.error('Need field location and spray date to recover weather.');
      return;
    }

    setIsRecovering(true);
    try {
      const hist = await WeatherService.fetchHistoricalConditions(
        field.lat,
        field.lng,
        sprayDate,
        startTime || undefined
      );

      if (hist) {
        setWeather(hist);
        setManualWindDirection(hist.windDirection);
        setManualWindSpeed(hist.wind.toString());
        toast.success(`Recovered weather for ${sprayDate}${startTime ? ' at ' + startTime : ''}`);
      } else {
        toast.error('Could not find historical weather for this time.');
      }
    } catch {
      toast.error('Weather recovery failed.');
    } finally {
      setIsRecovering(false);
    }
  }, [field.lat, field.lng, sprayDate, startTime]);

  const isMinimumValid = useMemo(() =>
    products.length > 0 && products.some(p => p.product.trim()) && !!sprayDate,
  [products, sprayDate]);

  const isFullyCompliant = useMemo(() =>
    products.every(p => p.product.trim()) &&
    startTime.trim() &&
    endTime.trim() &&
    (!!weather && !weather.isError) &&
    applicatorName.trim() &&
    licenseNumber.trim() &&
    manualWindDirection.trim() &&
    cropOrSiteTreated.trim() &&
    applicationMethod.trim() &&
    equipmentId.trim() &&
    products.every(p => p.epaRegNumber?.trim()),
  [products, startTime, endTime, weather, applicatorName, licenseNumber, manualWindDirection, cropOrSiteTreated, applicationMethod, equipmentId]);

  const missingComplianceFields = useMemo(() => {
    const missing: string[] = [];
    if (!products.every(p => p.product.trim())) missing.push('Product name(s)');
    if (!startTime.trim()) missing.push('Start time');
    if (!endTime.trim()) missing.push('End time');
    if (!weather || weather.isError) missing.push('Weather data');
    if (!applicatorName.trim()) missing.push('Cert. applicator');
    if (!licenseNumber.trim()) missing.push('License #');
    if (!manualWindDirection.trim()) missing.push('Wind direction');
    if (!cropOrSiteTreated.trim()) missing.push('Crop / site treated');
    if (!applicationMethod.trim()) missing.push('Application method');
    if (!equipmentId.trim()) missing.push('Equipment ID');
    if (!products.every(p => p.epaRegNumber?.trim())) missing.push('EPA Reg # (one or more products)');
    return missing;
  }, [products, startTime, endTime, weather, applicatorName, licenseNumber, manualWindDirection, cropOrSiteTreated, applicationMethod, equipmentId]);

  const stepValidation = useMemo(() => ({
    core: !!sprayDate && startTime.trim() && applicatorName.trim() && licenseNumber.trim() && targetPest.trim(),
    mix: products.some(p => p.product.trim()),
    conditions: true,
    review: true
  }), [sprayDate, startTime, applicatorName, licenseNumber, targetPest, products]);

  const canGoNext = useMemo(() => {
    if (step === 'core') return stepValidation.core;
    if (step === 'mix') return stepValidation.mix;
    if (step === 'conditions') return true;
    return false;
  }, [step, stepValidation]);

  const canGoBack = stepIndex > 0;

  const goNext = useCallback(() => {
    if (!canGoNext) {
      setShowValidation(true);
      native.haptic.error();
      return;
    }
    setShowValidation(false);
    const nextIndex = stepIndex + 1;
    if (nextIndex < WIZARD_STEPS.length) {
      setStep(WIZARD_STEPS[nextIndex]);
      native.haptic.light();
    }
  }, [canGoNext, stepIndex]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) {
      setStep(WIZARD_STEPS[stepIndex - 1]);
      native.haptic.light();
    }
  }, [stepIndex]);

  const goToStep = useCallback((target: SprayWizardStep) => {
    const targetIndex = WIZARD_STEPS.indexOf(target);
    // Only allow jumping to steps that have been reached or are immediately next.
    if (targetIndex <= stepIndex + 1) {
      setStep(target);
    }
  }, [stepIndex]);

  const handleSubmit = useCallback(async (keepOpen = false) => {
    if (!isMinimumValid) {
      setShowValidation(true);
      toast.error('Enter at least one product name and an application date to save.');
      native.haptic.error();
      return;
    }
    if (!isFullyCompliant && !hasSeenIncompleteWarning.current) {
      setShowValidation(true);
      hasSeenIncompleteWarning.current = true;
      toast.warning('Compliance fields are incomplete. Click Save again to save anyway.');
      native.haptic.light();
      return;
    }
    if (!isFullyCompliant) {
      setShowValidation(true);
    }

    setIsSaving(true);
    try {
      if (applicatorName.trim()) localStorage.setItem(`al_applicator_name_${userPrefix}`, applicatorName.trim());
      if (licenseNumber.trim()) localStorage.setItem(`al_license_number_${userPrefix}`, licenseNumber.trim());
      if (equipmentId.trim()) localStorage.setItem(`al_equipment_id_${userPrefix}`, equipmentId.trim());

      let finalNotes = notes.trim();
      if (photoBase64 && photoType) {
        finalNotes = `${finalNotes}\n[ATTACHMENT:data:${photoType};base64,${photoBase64}]`.trim();
      }

      const data = {
        fieldId: field.id,
        fieldName: field.name,
        products: products.filter(p => p.product.trim()).map(p => ({
          ...p,
          totalProductAmount: p.totalProductAmount || undefined,
          totalProductUnit: p.totalProductUnit || 'gal'
        })),
        windSpeed: !isNaN(parseFloat(manualWindSpeed)) ? parseFloat(manualWindSpeed) : (weather ? weather.wind : (initialDataRef.current?.windSpeed ?? 0)),
        temperature: weather ? weather.temp : (initialDataRef.current?.temperature ?? 0),
        applicatorName: applicatorName.trim(),
        licenseNumber: licenseNumber.trim(),
        epaRegNumber: products[0]?.epaRegNumber,
        targetPest: targetPest.trim() || undefined,
        windDirection: manualWindDirection || weather?.windDirection || initialDataRef.current?.windDirection,
        relativeHumidity: weather ? weather.humidity : (initialDataRef.current?.relativeHumidity ?? 0),
        sprayDate: sprayDate || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        siteAddress: siteAddress.trim() || undefined,
        cropOrSiteTreated: cropOrSiteTreated.trim() || undefined,
        applicationMethod: applicationMethod.trim() || undefined,
        treatedAreaSize: parseFloat(treatedAreaSize) || 0,
        treatedAreaUnit: treatedAreaUnit || 'ac',
        totalAmountApplied: parseFloat(totalAmountApplied) || 0,
        mixtureRate: mixtureRate.trim() || undefined,
        totalMixtureVolume: totalMixtureVolume.trim() || undefined,
        involvedTechnicians: involvedTechnicians.trim() || undefined,
        equipmentId: equipmentId.trim() || undefined,
        rei: rei.trim() || undefined,
        notes: finalNotes || undefined,
        sensitiveAreaCheck,
        sensitiveAreaNotes: sensitiveAreaNotes.trim() || undefined,
        complianceProfile,
        isPremixed,
        nonCompliant: !isFullyCompliant,
        deleted_at: null,
        seasonYear: initialDataRef.current && !isDuplicate ? initialDataRef.current.seasonYear : viewingSeason,
      };

      let success = false;
      if (initialDataRef.current && !isDuplicate) {
        success = await updateSprayRecord({ ...initialDataRef.current, ...data });
      } else {
        success = await addSprayRecord(data);
      }

      if (success) {
        native.haptic.success();

        // Save as recipe prompt — only fire when the mix is novel.
        // The canonical save success toast is fired by useSprayRecords.addSprayRecord,
        // so we only emit a toast here when there's an actionable follow-up.
        const currentProducts = [...products];
        const currentApplicator = applicatorName.trim();
        const currentLicense = licenseNumber.trim();
        const currentTargetPest = targetPest.trim();

        const getMixSignature = (recipeProducts: typeof currentProducts) => recipeProducts
          .map(p => [
            p.product.trim().toLowerCase(),
            p.rate.trim().toLowerCase(),
            p.rateUnit.trim().toLowerCase(),
            p.epaRegNumber?.trim().toLowerCase() || '',
          ].join('|'))
          .sort()
          .join(',');
        const mixSignature = getMixSignature(currentProducts);
        const recipeExists = sprayRecipes.some(r => getMixSignature(r.products) === mixSignature);
        const shouldPromptForRecipe = currentProducts.some(p => p.product.trim()) && !recipeExists;

        if (shouldPromptForRecipe) {
          pendingRecipeRef.current = {
            products: currentProducts.filter(p => p.product.trim()).map(p => ({
              product: p.product,
              rate: p.rate,
              rateUnit: p.rateUnit,
              epaRegNumber: p.epaRegNumber,
              activeIngredients: p.activeIngredients
            })),
            applicatorName: currentApplicator,
            licenseNumber: currentLicense,
            targetPest: currentTargetPest,
          };
          setRecipeName('');
          closeAfterRecipeDialogRef.current = !keepOpen;
          setRecipeDialogOpen(true);
          toast.success('Spray record saved.', {
            description: 'Tap "Save as Recipe" to reuse this chemical mix.',
            action: {
              label: 'Save as Recipe',
              onClick: () => setRecipeDialogOpen(true),
            },
            duration: 10000,
          });
        }

        if (keepOpen) {
          setProducts([createEmptyProduct()]);
          setNotes('');
          setPhotoBase64('');
          setPhotoType('');
          setTotalAmountApplied('');
          setStartTime(new Date().toTimeString().slice(0, 5));
          setEndTime('');
          setIsEndTimeManual(false);
          setShowValidation(false);
          hasSeenIncompleteWarning.current = false;
          setStep('core');
        } else if (!shouldPromptForRecipe) {
          onClose();
        }
      } else {
        native.haptic.error();
      }
    } catch (err) {
      console.error('Submission error:', err);
      toast.error('An unexpected error occurred while saving.');
      native.haptic.error();
    } finally {
      setIsSaving(false);
    }
  }, [isMinimumValid, isFullyCompliant, applicatorName, licenseNumber, equipmentId, products, manualWindSpeed, weather, targetPest, manualWindDirection, sprayDate, startTime, endTime, siteAddress, cropOrSiteTreated, applicationMethod, treatedAreaSize, treatedAreaUnit, totalAmountApplied, mixtureRate, totalMixtureVolume, involvedTechnicians, rei, notes, sensitiveAreaCheck, sensitiveAreaNotes, complianceProfile, isPremixed, field.id, field.name, viewingSeason, userPrefix, addSprayRecord, updateSprayRecord, onClose, isDuplicate, sprayRecipes, photoBase64, photoType]);

  const confirmSaveRecipe = useCallback(async () => {
    const pending = pendingRecipeRef.current;
    const name = recipeName.trim();
    if (!pending || !name) return;

    setIsSavingRecipe(true);
    try {
      const recSuccess = await addSprayRecipe({
        name,
        products: pending.products,
        applicatorName: pending.applicatorName,
        licenseNumber: pending.licenseNumber,
        targetPest: pending.targetPest,
        deleted_at: null,
      });
      if (recSuccess) {
        toast.success(`Recipe "${name}" saved.`);
        setRecipeDialogOpen(false);
        setRecipeName('');
        pendingRecipeRef.current = null;
        if (closeAfterRecipeDialogRef.current) {
          closeAfterRecipeDialogRef.current = false;
          onClose();
        }
      } else {
        toast.error('Failed to save recipe.');
      }
    } finally {
      setIsSavingRecipe(false);
    }
  }, [recipeName, addSprayRecipe, onClose]);

  const cancelRecipeDialog = useCallback(() => {
    setRecipeDialogOpen(false);
    setRecipeName('');
    pendingRecipeRef.current = null;
    if (closeAfterRecipeDialogRef.current) {
      closeAfterRecipeDialogRef.current = false;
      onClose();
    }
  }, [onClose]);

  return {
    // Wizard
    step,
    setStep,
    stepIndex,
    WIZARD_STEPS,
    canGoNext,
    canGoBack,
    goNext,
    goBack,
    goToStep,

    // Quick/Glove mode & Photo attachment
    isQuickMode,
    setIsQuickMode,
    photoBase64,
    setPhotoBase64,
    photoType,
    setPhotoType,

    // Save-as-recipe dialog
    recipeDialogOpen,
    recipeName,
    setRecipeName,
    setRecipeDialogOpen,
    confirmSaveRecipe,
    cancelRecipeDialog,
    isSavingRecipe,

    // State values
    products,
    selectedRecipeId,
    applicatorName,
    licenseNumber,
    targetPest,
    sprayDate,
    startTime,
    endTime,
    isEndTimeManual,
    involvedTechnicians,
    siteAddress,
    treatedAreaSize,
    treatedAreaUnit,
    totalAmountApplied,
    mixtureRate,
    totalMixtureVolume,
    equipmentId,
    manualWindDirection,
    manualWindSpeed,
    isPremixed,
    cropOrSiteTreated,
    applicationMethod,
    rei,
    notes,
    sensitiveAreaCheck,
    sensitiveAreaNotes,
    complianceProfile,
    weather,
    loading,
    isRecovering,
    isSaving,
    showValidation,

    // Setters exposed to steps
    setProducts,
    setSelectedRecipeId,
    setApplicatorName,
    setLicenseNumber,
    setTargetPest,
    setSprayDate,
    setStartTime,
    setEndTime,
    setIsEndTimeManual,
    setInvolvedTechnicians,
    setSiteAddress,
    setTreatedAreaSize,
    setTreatedAreaUnit,
    setTotalAmountApplied,
    setMixtureRate,
    setTotalMixtureVolume,
    setEquipmentId,
    setManualWindDirection,
    setManualWindSpeed,
    setIsPremixed,
    setCropOrSiteTreated,
    setApplicationMethod,
    setRei,
    setNotes,
    setSensitiveAreaCheck,
    setSensitiveAreaNotes,

    // Actions
    updateProduct,
    addProduct,
    removeProduct,
    handleRecipeSelect,
    handleRecoverWeather,
    handleSubmit,
    setShowValidation,

    // Validation
    isMinimumValid,
    isFullyCompliant,
    missingComplianceFields,
    stepValidation,

    // Prefill recommendation
    suggestedSpray
  };
}
