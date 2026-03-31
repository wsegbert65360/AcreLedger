import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { Field, SprayRecipeProduct, SprayRecord } from '@/types/farm';
import { WeatherService } from '@/services/WeatherService';
import { WeatherData } from '@/types/weather';
import { CloudRain, Loader2, Clock, MapPin, User, FileText, X, Plus, FileDown } from 'lucide-react';
import { generateSprayPDF } from '@/lib/sprayExport';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { calculateTotalAmount } from '@/utils/unitConversion';
import { Thermometer, Droplets } from 'lucide-react';

interface SprayModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: SprayRecord;
}

export default function SprayModal({ field, open, onClose, initialData }: SprayModalProps) {
  const { addSprayRecord, updateSprayRecord, sprayRecipes, session, activeSeason, farmName } = useFarm();
  const userPrefix = session?.user?.id?.slice(0, 8) || "local";

  /** Read saved defaults from localStorage (set in Settings > Spray Defaults) */
  const getDefaults = () => ({
    equipmentId: localStorage.getItem(`al_equipment_id_${userPrefix}`) || '',
    cropOrSiteTreated: localStorage.getItem(`al_default_crop_${userPrefix}`) || '',
    applicationMethod: localStorage.getItem(`al_default_app_method_${userPrefix}`) || 'Ground Broadcast',
    rei: localStorage.getItem(`al_default_rei_${userPrefix}`) || '12h',
    targetPest: localStorage.getItem(`al_default_target_pest_${userPrefix}`) || '',
  });

  /** Creates a new empty product entry with all fields initialized to defaults. */
  const createEmptyProduct = (): SprayRecipeProduct => ({
    ui_id: crypto.randomUUID(),
    product: '',
    rate: '',
    rateUnit: 'oz/ac',
    epaRegNumber: '',
    activeIngredients: '',
    totalProductAmount: '',
    totalProductUnit: 'gal',
  });

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<SprayRecipeProduct[]>(initialData?.products?.map(p => ({ ...p, ui_id: p.ui_id || crypto.randomUUID() })) || [createEmptyProduct()]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [applicatorName, setApplicatorName] = useState(() => initialData?.applicatorName || localStorage.getItem(`al_applicator_name_${userPrefix}`) || '');
  const [licenseNumber, setLicenseNumber] = useState(() => initialData?.licenseNumber || localStorage.getItem(`al_license_number_${userPrefix}`) || '');
  const [targetPest, setTargetPest] = useState(initialData?.targetPest || getDefaults().targetPest || 'grass/broadleaves');
  const [sprayDate, setSprayDate] = useState(initialData?.sprayDate || new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(() => initialData?.startTime || new Date().toTimeString().slice(0, 5));
  const [involvedTechnicians, setInvolvedTechnicians] = useState(initialData?.involvedTechnicians || '');
  const [siteAddress, setSiteAddress] = useState(initialData?.siteAddress || field.name);
  const [treatedAreaSize, setTreatedAreaSize] = useState(initialData?.treatedAreaSize?.toString() || field.acreage.toString());
  const [mixtureRate, setMixtureRate] = useState(initialData?.mixtureRate || '');
  const [totalMixtureVolume, setTotalMixtureVolume] = useState(initialData?.totalMixtureVolume || '');
  const defaults = getDefaults();
  const [equipmentId, setEquipmentId] = useState(() => initialData?.equipmentId || defaults.equipmentId || 'Miller Nitro');
  const [manualWindDirection, setManualWindDirection] = useState<string>(initialData?.windDirection || '');
  const [isPremixed, setIsPremixed] = useState(initialData?.isPremixed || false);

  // New Universal Fields
  const [endTime, setEndTime] = useState(initialData?.endTime || '');
  const [isEndTimeManual, setIsEndTimeManual] = useState(!!initialData?.endTime);
  const [cropOrSiteTreated, setCropOrSiteTreated] = useState(initialData?.cropOrSiteTreated || defaults.cropOrSiteTreated || '');
  const [applicationMethod, setApplicationMethod] = useState(initialData?.applicationMethod || defaults.applicationMethod || 'Ground Broadcast');
  const [treatedAreaUnit, setTreatedAreaUnit] = useState(initialData?.treatedAreaUnit || 'ac');
  const [rei, setRei] = useState(initialData?.rei || defaults.rei || '12h');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [complianceProfile] = useState(initialData?.complianceProfile || 'universal');
  const [isSaving, setIsSaving] = useState(false);

  // Ref for treatedAreaSize — used inside setProducts callbacks to avoid stale closure
  const treatedAreaRef = useRef(treatedAreaSize);
  treatedAreaRef.current = treatedAreaSize;

  // Manual weather overrides (used when API is unavailable or user prefers manual entry)
  const [manualWindSpeed, setManualWindSpeed] = useState(() =>
    initialData?.windSpeed && initialData?.windSpeed > 0 ? initialData.windSpeed.toString() : ''
  );
  const [manualTemperature, setManualTemperature] = useState(() =>
    initialData?.temperature && initialData?.temperature > 0 ? initialData.temperature.toString() : ''
  );
  const [manualHumidity, setManualHumidity] = useState(() =>
    initialData?.relativeHumidity && initialData.relativeHumidity > 0 ? initialData.relativeHumidity.toString() : ''
  );
  const [isManualWeather, setIsManualWeather] = useState(false);

  // Set manual weather mode when API fails or no coords
  useEffect(() => {
    if (!open) return;
    if (field.lat == null || field.lng == null) {
      setIsManualWeather(true);
    }
  }, [open, field.lat, field.lng]);

  // Auto-set manual weather fields from API data when not in manual mode
  useEffect(() => {
    if (!open || isManualWeather) return;
    if (weather && !weather.isError) {
      if (!manualWindSpeed) setManualWindSpeed(weather.wind.toString());
      if (!manualTemperature) setManualTemperature(weather.temp.toString());
      if (!manualHumidity) setManualHumidity(weather.humidity.toString());
    } else if (weather?.isError) {
      // API failed — switch to manual mode
      setIsManualWeather(true);
    }
  }, [open, weather, isManualWeather]);

  // Handle End Time Estimation
  useEffect(() => {
    if (isEndTimeManual || !startTime || !treatedAreaSize) return;
    
    const acres = parseFloat(treatedAreaSize);
    if (isNaN(acres) || acres <= 0) return;

    const [hours, minutes] = startTime.split(':').map(Number);
    const startMins = hours * 60 + minutes;
    
    // 54.5 acres per hour = 0.90833 acres per minute
    const durationMins = Math.round(acres / (54.5 / 60));
    const endTotalMins = (startMins + durationMins) % (24 * 60);
    
    const endH = Math.floor(endTotalMins / 60).toString().padStart(2, '0');
    const endM = (endTotalMins % 60).toString().padStart(2, '0');
    
    setEndTime(`${endH}:${endM}`);
  }, [startTime, treatedAreaSize, isEndTimeManual]);

  const resetComplianceFields = () => {
    const now = new Date();
    const d = getDefaults();
    setStartTime(now.toTimeString().slice(0, 5));
    setEndTime('');
    setIsEndTimeManual(false);
    setCropOrSiteTreated(d.cropOrSiteTreated || '');
    setApplicationMethod(d.applicationMethod || 'Ground Broadcast');
    setTreatedAreaUnit('ac');
    setRei(d.rei || '12h');
    setNotes('');
    setSiteAddress(field.name);
    setTreatedAreaSize(field.acreage.toString());
    setTargetPest(d.targetPest || 'grass/broadleaves');
    setEquipmentId(d.equipmentId || 'Miller Nitro');
    setMixtureRate('');
    setTotalMixtureVolume('');
    setIsPremixed(false);
    setManualWindDirection('');
    setManualWindSpeed('');
    setManualTemperature('');
    setManualHumidity('');
    setIsManualWeather(false);
    setProducts([createEmptyProduct()]);
    setSelectedRecipeId('');
  };

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      const acres = parseFloat(initialData.treatedAreaSize?.toString() || field.acreage.toString());
      setProducts(initialData.products?.map(p => {
        const rate = parseFloat(p.rate || '0');
        let totalProductAmount = p.totalProductAmount || '';
        let totalProductUnit = p.totalProductUnit || 'gal';
        // Auto-fill per-product totals for records saved before this feature existed
        if (!totalProductAmount && !isNaN(rate) && !isNaN(acres) && rate > 0 && acres > 0) {
          const { value, unit } = calculateTotalAmount(rate, acres, p.rateUnit);
          totalProductAmount = value.toString();
          totalProductUnit = unit;
        }
        return { ...p, ui_id: p.ui_id || crypto.randomUUID(), epaRegNumber: p.epaRegNumber || '', totalProductAmount, totalProductUnit };
      }) || [createEmptyProduct()]);
      setApplicatorName(initialData.applicatorName || '');
      setLicenseNumber(initialData.licenseNumber || '');
      setTargetPest(initialData.targetPest || 'grass/broadleaves');
      setSprayDate(initialData.sprayDate || new Date().toISOString().split('T')[0]);
      setStartTime(initialData.startTime || '');
      setEndTime(initialData.endTime || '');
      setIsEndTimeManual(!!initialData.endTime);
      setSiteAddress(initialData.siteAddress || field.name);
      setTreatedAreaSize(initialData.treatedAreaSize?.toString() || field.acreage.toString());
      setTreatedAreaUnit(initialData.treatedAreaUnit || 'ac');
      setMixtureRate(initialData.mixtureRate || '');
      setTotalMixtureVolume(initialData.totalMixtureVolume || '');
      setInvolvedTechnicians(initialData.involvedTechnicians || '');
      setEquipmentId(initialData.equipmentId || '');
      setManualWindDirection(initialData.windDirection || '');
      setIsPremixed(initialData.isPremixed || false);
      setCropOrSiteTreated(initialData.cropOrSiteTreated || '');
      setApplicationMethod(initialData.applicationMethod || 'Ground Broadcast');
      setRei(initialData.rei || '12h');
      setNotes(initialData.notes || '');
      setSelectedRecipeId('');
      // Pre-populate manual weather fields from saved record
      if (initialData.windSpeed && initialData.windSpeed > 0) setManualWindSpeed(initialData.windSpeed.toString());
      if (initialData.temperature && initialData.temperature > 0) setManualTemperature(initialData.temperature.toString());
      if (initialData.relativeHumidity && initialData.relativeHumidity > 0) setManualHumidity(initialData.relativeHumidity.toString());
    } else {
      resetComplianceFields();
    }
  }, [open, initialData, field]);

  useEffect(() => {
    if (!open) return;
    if (field.lat == null || field.lng == null) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    WeatherService.fetchCurrentWeather(`${field.lat},${field.lng}`, controller.signal)
      .then(w => {
        if (!controller.signal.aborted) {
          setWeather(w);
          if (w && !manualWindDirection) setManualWindDirection(w.windDirection);
          setLoading(false);
        }
      }).catch((err) => {
        if (err.name !== 'AbortError') setLoading(false);
      });
    return () => controller.abort();
  }, [open, field.lat, field.lng]);

  const handleRecipeSelect = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    const recipe = sprayRecipes.find(r => r.id === recipeId);
    if (recipe) {
      const acres = parseFloat(treatedAreaSize);
      setProducts(recipe.products.map(p => {
        const rate = parseFloat(p.rate || '0');
        let totalProductAmount = p.totalProductAmount || '';
        let totalProductUnit = p.totalProductUnit || 'gal';
        if (!isNaN(rate) && !isNaN(acres) && rate > 0 && acres > 0) {
          const { value, unit } = calculateTotalAmount(rate, acres, p.rateUnit);
          totalProductAmount = value.toString();
          totalProductUnit = unit;
        }
        return { ...p, ui_id: crypto.randomUUID(), epaRegNumber: p.epaRegNumber || '', totalProductAmount, totalProductUnit };
      }));
      if (recipe.applicatorName) setApplicatorName(recipe.applicatorName);
      if (recipe.licenseNumber) setLicenseNumber(recipe.licenseNumber);
      if (recipe.targetPest) setTargetPest(recipe.targetPest);
      if (recipe.cropOrSiteTreated) setCropOrSiteTreated(recipe.cropOrSiteTreated);
    }
  };

  const updateTreatedArea = (val: string) => {
    setTreatedAreaSize(val);
    const acres = parseFloat(val);
    if (isNaN(acres) || acres <= 0) return;
    setProducts(prev => prev.map(p => {
      const rate = parseFloat(p.rate || '0');
      if (isNaN(rate) || rate <= 0) return p;
      const { value, unit } = calculateTotalAmount(rate, acres, p.rateUnit);
      return { ...p, totalProductAmount: value.toString(), totalProductUnit: unit };
    }));
  };

  const updateProduct = (i: number, field: keyof SprayRecipeProduct, value: string) => {
    setProducts(prev => prev.map((p, idx) => {
      if (idx !== i) return p;
      const updated = { ...p, [field]: value };
      // Auto-calculate per-product total when rate or unit changes
      if (field === 'rate' || field === 'rateUnit') {
        const acres = parseFloat(treatedAreaRef.current); // use ref to avoid stale closure
        const rate = parseFloat(updated.rate || '0');
        if (!isNaN(rate) && !isNaN(acres) && rate > 0 && acres > 0) {
          const { value: totalVal, unit: totalUnit } = calculateTotalAmount(rate, acres, updated.rateUnit);
          updated.totalProductAmount = totalVal.toString();
          updated.totalProductUnit = totalUnit;
        }
      }
      return updated;
    }));
  };

  const addProduct = () => {
    setProducts(prev => [...prev, createEmptyProduct()]);
  };

  const removeProduct = (i: number) => {
    setProducts(prev => prev.filter((_, idx) => idx !== i));
  };

  const [showValidation, setShowValidation] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(true);

  /** Returns class names to visually highlight a required field that's empty during validation. */
  const missing = (value: string) => showValidation && !value.trim()
    ? 'border-destructive ring-2 ring-destructive bg-destructive/10'
    : '';
  const missingLabel = (value: string) => showValidation && !value.trim()
    ? 'text-destructive font-bold'
    : '';

  const isMinimumValid = products.length > 0 && products.some(p => p.product.trim()) && !!sprayDate;

  const hasWeatherData = isManualWeather
    ? (manualWindSpeed.trim() && manualTemperature.trim() && manualHumidity.trim())
    : (!!weather && !weather.isError);

  const isFullyCompliant =
    products.every(p => p.product.trim()) &&
    startTime.trim() &&
    endTime.trim() &&
    hasWeatherData &&
    applicatorName.trim() &&
    licenseNumber.trim() &&
    manualWindDirection.trim() &&
    cropOrSiteTreated.trim() &&
    applicationMethod.trim() &&
    equipmentId.trim() &&
    products.every(p => p.epaRegNumber?.trim());

  const missingComplianceFields = useMemo(() => {
    const fields: string[] = [];
    if (!products.every(p => p.product.trim())) fields.push('Product name(s)');
    if (!startTime.trim()) fields.push('Start time');
    if (!endTime.trim()) fields.push('End time');
    if (!hasWeatherData) fields.push('Weather data (wind speed, temp, humidity)');
    if (!applicatorName.trim()) fields.push('Cert. applicator');
    if (!licenseNumber.trim()) fields.push('License #');
    if (!manualWindDirection.trim()) fields.push('Wind direction');
    if (!cropOrSiteTreated.trim()) fields.push('Crop / site treated');
    if (!applicationMethod.trim()) fields.push('Application method');
    if (!equipmentId.trim()) fields.push('Equipment ID');
    if (!products.every(p => p.epaRegNumber?.trim())) fields.push('EPA Reg # (one or more products)');
    return fields;
  }, [products, startTime, endTime, hasWeatherData, applicatorName, licenseNumber, manualWindDirection, cropOrSiteTreated, applicationMethod, equipmentId]);

  const handleSubmit = async () => {
    if (!isMinimumValid) {
      setShowValidation(true);
      setComplianceOpen(true);
      toast.error('Enter at least one product name and an application date to save.');
      return;
    }
    if (!isFullyCompliant) {
      setShowValidation(true);
      setComplianceOpen(true);
    }

    setIsSaving(true);
    try {
      if (applicatorName.trim()) localStorage.setItem(`al_applicator_name_${userPrefix}`, applicatorName.trim());
      if (licenseNumber.trim()) localStorage.setItem(`al_license_number_${userPrefix}`, licenseNumber.trim());
      if (equipmentId.trim()) localStorage.setItem(`al_equipment_id_${userPrefix}`, equipmentId.trim());

      const data = {
        fieldId: field.id,
        fieldName: field.name,
        products: products.filter(p => p.product.trim()).map(p => ({
          ...p,
          totalProductAmount: p.totalProductAmount || undefined,
          totalProductUnit: p.totalProductUnit || 'gal'
        })),
        windSpeed: parseFloat(manualWindSpeed) || weather?.wind || initialData?.windSpeed || 0,
        temperature: parseFloat(manualTemperature) || weather?.temp || initialData?.temperature || 0,
        applicatorName: applicatorName.trim(),
        licenseNumber: licenseNumber.trim(),
        // DEPRECATED (3.3a): Legacy record-level epaRegNumber — no longer written.
        // EPA reg numbers are now per-product only. Kept for backward read compatibility.
        // epaRegNumber: products[0]?.epaRegNumber,
        targetPest: targetPest.trim() || undefined,
        windDirection: manualWindDirection || weather?.windDirection || initialData?.windDirection,
        relativeHumidity: parseFloat(manualHumidity) || weather?.humidity || initialData?.relativeHumidity || 0,
        sprayDate: sprayDate || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        siteAddress: siteAddress.trim() || undefined,
        cropOrSiteTreated: cropOrSiteTreated.trim() || undefined,
        applicationMethod: applicationMethod.trim() || undefined,
        treatedAreaSize: parseFloat(treatedAreaSize) || 0,
        treatedAreaUnit: treatedAreaUnit || 'ac',
        mixtureRate: mixtureRate.trim() || undefined,
        totalMixtureVolume: totalMixtureVolume.trim() || undefined,
        involvedTechnicians: involvedTechnicians.trim() || undefined,
        equipmentId: equipmentId.trim() || undefined,
        rei: rei.trim() || undefined,
        notes: notes.trim() || undefined,
        complianceProfile,
        isPremixed,
        nonCompliant: !isFullyCompliant,
        deleted_at: null,
        seasonYear: activeSeason,
      };

      let success = false;
      if (initialData) {
        success = await updateSprayRecord({ ...initialData, ...data });
      } else {
        success = await addSprayRecord(data);
      }

      if (success) {
        onClose();
      }
    } catch (err) {
      console.error('Submission error:', err);
      toast.error('An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-spray/30 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-spray font-bold">
            <CloudRain size={20} />
            {initialData ? 'Edit' : 'Spray Application'} — {field.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-3">
            {sprayRecipes.length > 0 && (
              <div>
                <Label htmlFor="recipeSelect" className="text-muted-foreground font-mono text-xs">SELECT RECIPE</Label>
                <Select value={selectedRecipeId} onValueChange={handleRecipeSelect}>
                  <SelectTrigger className="mt-1 bg-muted border-border text-foreground">
                    <SelectValue placeholder="Recipe (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {sprayRecipes.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground font-mono text-xs font-bold uppercase tracking-wider">Herbicide Mix (Granular Audit) *</Label>
                <div className="text-[10px] font-mono text-muted-foreground">EPA REG # REQUIRED PER ITEM</div>
              </div>

              {products.map((p, i) => (
                <div key={p.ui_id || i} className="bg-muted p-2.5 rounded-md border border-border/50 relative">
                  {products.length > 1 && (
                    <button onClick={() => removeProduct(i)} className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 shadow-md hover:bg-destructive/80 transition-colors">
                      <X size={12} />
                    </button>
                  )}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-1">
                        <Label htmlFor={`productName-${i}`} className="text-[9px] font-mono text-muted-foreground uppercase">Trade Name *</Label>
                        <Input
                          id={`productName-${i}`}
                          value={p.product}
                          onChange={e => updateProduct(i, 'product', e.target.value)}
                          placeholder="e.g. Roundup"
                          className={`mt-0.5 bg-background border-border text-foreground text-xs h-8 ${showValidation && !p.product.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`}
                        />
                      </div>
                      <div className="col-span-1">
                        <Label htmlFor={`epaReg-${i}`} className="text-[9px] font-mono text-muted-foreground uppercase">EPA Reg #</Label>
                        <Input
                          id={`epaReg-${i}`}
                          value={p.epaRegNumber}
                          onChange={e => updateProduct(i, 'epaRegNumber', e.target.value)}
                          placeholder="e.g. 524-549"
                          className={`mt-0.5 bg-background border-border text-foreground text-xs h-8 ${showValidation && !p.epaRegNumber?.trim() ? 'border-yellow-500/50' : ''}`}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor={`activeIngredients-${i}`} className="text-[9px] font-mono text-muted-foreground uppercase">Active Ingredients</Label>
                      <Input
                        id={`activeIngredients-${i}`}
                        value={p.activeIngredients || ''}
                        onChange={e => updateProduct(i, 'activeIngredients', e.target.value)}
                        placeholder="e.g. Glyphosate 41%"
                        className="mt-0.5 bg-background border-border text-foreground text-xs h-8"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor={`appRate-${i}`} className="text-[9px] font-mono text-muted-foreground uppercase">Rate / Ac *</Label>
                        <div className="flex gap-1.5 mt-0.5">
                          <Input 
                            id={`appRate-${i}`} 
                            value={p.rate} 
                            onChange={e => updateProduct(i, 'rate', e.target.value)} 
                            placeholder="22" 
                            className="bg-background border-border text-foreground text-xs h-8 px-2 w-16" 
                          />
                          <Select 
                            value={p.rateUnit} 
                            onValueChange={(val) => updateProduct(i, 'rateUnit', val)}
                          >
                            <SelectTrigger className="bg-background border-border text-foreground text-[10px] h-8 px-2 flex-1">
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fl oz/ac">fl oz/ac (Liq)</SelectItem>
                              <SelectItem value="pt/ac">pt/ac (Liq)</SelectItem>
                              <SelectItem value="qt/ac">qt/ac (Liq)</SelectItem>
                              <SelectItem value="gal/ac">gal/ac (Liq)</SelectItem>
                              <SelectItem value="oz/ac">oz/ac (Dry)</SelectItem>
                              <SelectItem value="lb/ac">lb/ac (Dry)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor={`totalProduct-${i}`} className="text-[9px] font-mono text-muted-foreground uppercase">Total Product Amt</Label>
                        <div className="flex gap-1.5 mt-0.5">
                          <Input 
                            id={`totalProduct-${i}`} 
                            value={p.totalProductAmount || ''} 
                            onChange={e => updateProduct(i, 'totalProductAmount', e.target.value)} 
                            placeholder="15" 
                            className="bg-background border-border text-foreground text-xs h-8 px-2 w-16" 
                          />
                          <Select 
                            value={p.totalProductUnit || 'gal'} 
                            onValueChange={(val) => updateProduct(i, 'totalProductUnit', val)}
                          >
                            <SelectTrigger className="bg-background border-border text-foreground text-[10px] h-8 px-2 flex-1">
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gal">gal (Liq)</SelectItem>
                              <SelectItem value="qt">qt (Liq)</SelectItem>
                              <SelectItem value="pt">pt (Liq)</SelectItem>
                              <SelectItem value="fl oz">fl oz (Liq)</SelectItem>
                              <SelectItem value="lb">lb (Dry)</SelectItem>
                              <SelectItem value="oz">oz (Dry)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <Button onClick={addProduct} variant="outline" size="sm" className="w-full border-dashed border-spray/30 text-spray text-[10px] h-8 font-bold">
                <Plus size={12} className="mr-1" /> ADD ANOTHER PRODUCT
              </Button>
            </div>

            <div>
              <Label htmlFor="sprayDate" className="text-muted-foreground font-mono text-xs font-bold">APPLICATION DATE *</Label>
              <Input id="sprayDate" name="sprayDate" type="date" value={sprayDate} onChange={e => setSprayDate(e.target.value)} className="mt-1 bg-muted border-border text-foreground" />
            </div>
          </div>

          <Accordion type="single" collapsible className="w-full" value={complianceOpen ? 'compliance' : undefined} onValueChange={(v) => setComplianceOpen(v === 'compliance')}>
            <AccordionItem value="compliance" className="border-spray/20">
              <AccordionTrigger className="text-spray font-mono text-xs font-bold hover:no-underline py-2">
                APPLICATION & COMPLIANCE DETAILS
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <Clock size={12} /> timing
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="startTime" className={`text-[10px] font-mono uppercase ${missingLabel(startTime)}`}>Start Time *</Label>
                      <Input id="startTime" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${missing(startTime)}`} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="endTime" className={`text-[10px] font-mono uppercase ${missingLabel(endTime)}`}>End Time *</Label>
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] font-mono text-muted-foreground">MANUAL</span>
                          <Switch id="endTimeManual" checked={isEndTimeManual} onCheckedChange={setIsEndTimeManual} className="scale-75 h-4 w-7" />
                        </div>
                      </div>
                      <Input id="endTime" type="time" value={endTime} onChange={e => { setEndTime(e.target.value); setIsEndTimeManual(true); }} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${missing(endTime)}`} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <MapPin size={12} /> site & crop
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-1">
                      <Label htmlFor="cropTreated" className={`text-[10px] font-mono uppercase ${missingLabel(cropOrSiteTreated)}`}>Crop / Site Treated *</Label>
                      <Input id="cropTreated" value={cropOrSiteTreated} onChange={e => setCropOrSiteTreated(e.target.value)} placeholder="e.g. Corn" className={`mt-0.5 bg-muted border-border text-foreground h-9 ${missing(cropOrSiteTreated)}`} />
                    </div>
                    <div>
                      <Label htmlFor="appMethod" className={`text-[10px] font-mono uppercase ${missingLabel(applicationMethod)}`}>App Method *</Label>
                      <Select value={applicationMethod} onValueChange={setApplicationMethod}>
                        <SelectTrigger className={`mt-0.5 bg-muted border-border text-foreground h-9 text-xs ${missing(applicationMethod)}`}>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          {['Ground Broadcast', 'Ground Banded', 'Ground Directed', 'Aerial', 'Chemigation', 'Handheld'].map(m => (
                            <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="siteAddress" className="text-[10px] font-mono text-muted-foreground uppercase">Site Description / Address</Label>
                    <Input id="siteAddress" value={siteAddress} onChange={e => setSiteAddress(e.target.value)} placeholder="Field name or location" className="mt-0.5 bg-muted border-border text-foreground h-9" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <FileText size={12} /> area & volume
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="treatedArea" className={`text-[10px] font-mono uppercase ${missingLabel(treatedAreaSize)}`}>Treated Area Size *</Label>
                      <div className="flex gap-1">
                        <Input id="treatedArea" value={treatedAreaSize} onChange={e => updateTreatedArea(e.target.value)} placeholder="80" className={`mt-0.5 bg-muted border-border text-foreground h-9 flex-1 ${missing(treatedAreaSize)}`} />
                        <Select value={treatedAreaUnit} onValueChange={setTreatedAreaUnit}>
                          <SelectTrigger className="mt-0.5 bg-muted border-border text-foreground h-9 w-16 text-xs capitaize">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ac">ac</SelectItem>
                            <SelectItem value="sqft">sqft</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="targetPest" className={`text-[10px] font-mono uppercase ${missingLabel(targetPest)}`}>Target Pest(s) *</Label>
                      <Input id="targetPest" value={targetPest} onChange={e => setTargetPest(e.target.value)} placeholder="e.g. Pigweed" className={`mt-0.5 bg-muted border-border text-foreground h-9 ${missing(targetPest)}`} />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch id="premixed" checked={isPremixed} onCheckedChange={setIsPremixed} />
                    <Label htmlFor="premixed" className="text-[10px] font-mono text-muted-foreground uppercase">Premixed</Label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <User size={12} /> APPLICATORS & SAFETY
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="applicator" className={`text-[10px] font-mono uppercase ${missingLabel(applicatorName)}`}>Cert. Applicator *</Label>
                      <Input id="applicator" value={applicatorName} onChange={e => setApplicatorName(e.target.value)} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${missing(applicatorName)}`} />
                    </div>
                    <div>
                      <Label htmlFor="license" className={`text-[10px] font-mono uppercase ${missingLabel(licenseNumber)}`}>License # *</Label>
                      <Input id="license" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${missing(licenseNumber)}`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="equipmentId" className={`text-[10px] font-mono uppercase ${missingLabel(equipmentId)}`}>Equipment ID *</Label>
                      <Input id="equipmentId" value={equipmentId} onChange={e => setEquipmentId(e.target.value)} placeholder="e.g. Miller Nitro" className={`mt-0.5 bg-muted border-border text-foreground h-9 ${missing(equipmentId)}`} />
                    </div>
                    <div>
                      <Label htmlFor="rei" className="text-[10px] font-mono text-muted-foreground uppercase">REI (Re-entry)</Label>
                      <Input id="rei" value={rei} onChange={e => setRei(e.target.value)} placeholder="e.g. 12h" className="mt-0.5 bg-muted border-border text-foreground h-9" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="technicians" className="text-[10px] font-mono text-muted-foreground uppercase">Involved Technicians / Helpers (Optional)</Label>
                    <Input id="technicians" value={involvedTechnicians} onChange={e => setInvolvedTechnicians(e.target.value)} placeholder="e.g. John Doe, Mike Smith" className="mt-0.5 bg-muted border-border text-foreground h-9" />
                  </div>
                  <div>
                    <Label htmlFor="notes" className="text-[10px] font-mono text-muted-foreground uppercase">Notes / Additional Info</Label>
                    <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add any extra compliance or field notes here..." className="mt-0.5 bg-muted border-border text-foreground text-xs resize-none" rows={2} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className={`rounded-lg border p-3 space-y-3 ${hasWeatherData ? 'border-spray/20 bg-muted/30' : 'border-destructive/30 bg-destructive/5'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${hasWeatherData ? 'text-spray' : 'text-destructive'}`}>
                Environmental Conditions *
              </span>
              <div className="flex items-center gap-2">
                {loading && <Loader2 size={12} className="text-spray animate-spin" />}
                {!loading && weather && !isManualWeather && (
                  <button
                    type="button"
                    onClick={() => setIsManualWeather(true)}
                    className="text-[8px] font-mono text-muted-foreground hover:text-foreground underline"
                  >
                    Enter Manually
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={`text-[9px] font-mono uppercase ${missingLabel(manualWindDirection)}`}>Wind Direction *</Label>
                <Select value={manualWindDirection} onValueChange={setManualWindDirection}>
                  <SelectTrigger className={`h-8 bg-background border-border text-xs font-mono ${missing(manualWindDirection)}`}>
                    <SelectValue placeholder="Dir" />
                  </SelectTrigger>
                  <SelectContent>
                    {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'CALM'].map(dir => (
                      <SelectItem key={dir} value={dir} className="font-mono text-xs">{dir}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className={`text-[9px] font-mono uppercase ${missingLabel(isManualWeather ? manualWindSpeed : (weather?.wind?.toString() || ''))}`}>Wind Speed (mph) *</Label>
                {isManualWeather ? (
                  <Input
                    id="manualWindSpeed"
                    type="number"
                    inputMode="decimal"
                    value={manualWindSpeed}
                    onChange={e => setManualWindSpeed(e.target.value)}
                    placeholder="e.g. 8"
                    className={`h-8 bg-background border-border text-xs font-mono ${missing(manualWindSpeed)}`}
                  />
                ) : (
                  <div className="text-sm font-mono font-bold text-right pt-1">{weather?.wind || 0} mph</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border/30 pt-2">
              <div className="space-y-1">
                <div className={`text-[9px] font-mono uppercase flex items-center gap-1 ${missingLabel(isManualWeather ? manualTemperature : (weather?.temp?.toString() || ''))}`}>
                  <Thermometer size={9} /> Temp (°F) *
                </div>
                {isManualWeather ? (
                  <Input
                    id="manualTemperature"
                    type="number"
                    inputMode="decimal"
                    value={manualTemperature}
                    onChange={e => setManualTemperature(e.target.value)}
                    placeholder="e.g. 78"
                    className={`h-8 bg-background border-border text-xs font-mono ${missing(manualTemperature)}`}
                  />
                ) : (
                  <div className="text-xs font-mono font-bold">{weather?.temp || 0}°F</div>
                )}
              </div>
              <div className="space-y-1 text-right">
                <div className={`text-[9px] font-mono uppercase flex items-center gap-1 justify-end ${missingLabel(isManualWeather ? manualHumidity : (weather?.humidity?.toString() || ''))}`}>
                  <Droplets size={9} /> Humidity (%) *
                </div>
                {isManualWeather ? (
                  <Input
                    id="manualHumidity"
                    type="number"
                    inputMode="decimal"
                    value={manualHumidity}
                    onChange={e => setManualHumidity(e.target.value)}
                    placeholder="e.g. 55"
                    className={`h-8 bg-background border-border text-xs font-mono text-right ${missing(manualHumidity)}`}
                  />
                ) : (
                  <div className="text-xs font-mono font-bold">{weather?.humidity || 0}%</div>
                )}
              </div>
            </div>

            {isManualWeather && (
              <p className="text-[9px] font-mono text-muted-foreground/70 italic">
                Manual mode — enter conditions observed at time of application.
              </p>
            )}
          </div>
          {showValidation && !isFullyCompliant && isMinimumValid && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-1">
              <div className="flex items-center gap-2 text-destructive font-mono text-xs font-bold uppercase tracking-wider">
                <AlertTriangle size={14} />
                Missing {missingComplianceFields.length} field{missingComplianceFields.length !== 1 ? 's' : ''} — record will be saved as incomplete
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {missingComplianceFields.map(f => (
                  <li key={f} className="text-xs font-mono text-destructive font-semibold">✗ {f}</li>
                ))}
              </ul>
              <p className="text-[10px] font-mono text-destructive/60 mt-1.5">
                Fill these in now or complete later by editing the record.
              </p>
            </div>
          )}
          <div className="h-20" aria-hidden="true" />
        </div>
        <DialogFooter className="sticky bottom-0 bg-card pt-2 border-t border-border/20 flex flex-col gap-2">
          {initialData && (
            <Button
              variant="outline"
              onClick={() => generateSprayPDF([initialData], farmName)}
              className="touch-target w-full border-spray/30 text-spray hover:bg-spray/10 font-bold py-6 text-base"
            >
              <FileDown size={20} className="mr-2" />
              Export PDF
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!isMinimumValid || loading || isSaving}
            className={`touch-target w-full font-bold py-6 text-base disabled:opacity-50 disabled:grayscale ${
              isFullyCompliant
                ? 'bg-spray text-white hover:bg-spray/90 glow-spray'
                : 'bg-yellow-600 text-white hover:bg-yellow-500'
            }`}
          >
            {isSaving ? (
              <div className="flex items-center gap-2">
                <Loader2 size={24} className="animate-spin" />
                <span>Saving...</span>
              </div>
            ) : loading ? <Loader2 size={20} className="animate-spin" /> :
              !isMinimumValid ? 'Enter Product Name to Save' :
              !isFullyCompliant ? (
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} />
                  <span>{initialData ? 'Update (Incomplete Record)' : 'Save (Incomplete Record)'}</span>
                </div>
              ) :
                initialData ? 'Update Spray Record' : 'Save Spray Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
