import { useState, useEffect } from 'react';
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

interface SprayModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: SprayRecord;
}

export default function SprayModal({ field, open, onClose, initialData }: SprayModalProps) {
  const { addSprayRecord, updateSprayRecord, sprayRecipes, session, activeSeason, farmName } = useFarm();
  const userPrefix = session?.user?.id?.slice(0, 8) || "local";
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<SprayRecipeProduct[]>(initialData?.products?.map(p => ({ ...p, ui_id: p.ui_id || crypto.randomUUID() })) || [{ ui_id: crypto.randomUUID(), product: '', rate: '', rateUnit: 'oz/ac', epaRegNumber: '' }]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [applicatorName, setApplicatorName] = useState(() => initialData?.applicatorName || localStorage.getItem(`al_applicator_name_${userPrefix}`) || '');
  const [licenseNumber, setLicenseNumber] = useState(() => initialData?.licenseNumber || localStorage.getItem(`al_license_number_${userPrefix}`) || '');
  const [targetPest, setTargetPest] = useState(initialData?.targetPest || 'grass/broadleaves');
  const [sprayDate, setSprayDate] = useState(initialData?.sprayDate || new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(() => initialData?.startTime || new Date().toTimeString().slice(0, 5));
  const [involvedTechnicians, setInvolvedTechnicians] = useState(initialData?.involvedTechnicians || '');
  const [siteAddress, setSiteAddress] = useState(initialData?.siteAddress || field.name);
  const [treatedAreaSize, setTreatedAreaSize] = useState(initialData?.treatedAreaSize?.toString() || field.acreage.toString());
  const [totalAmountApplied, setTotalAmountApplied] = useState(initialData?.totalAmountApplied?.toString() || '');
  const [mixtureRate, setMixtureRate] = useState(initialData?.mixtureRate || '');
  const [totalMixtureVolume, setTotalMixtureVolume] = useState(initialData?.totalMixtureVolume || '');
  const [equipmentId, setEquipmentId] = useState(() => initialData?.equipmentId || localStorage.getItem(`al_equipment_id_${userPrefix}`) || 'Miller Nitro');
  const [manualWindDirection, setManualWindDirection] = useState<string>(initialData?.windDirection || '');
  const [isPremixed, setIsPremixed] = useState(initialData?.isPremixed || false);

  // New Universal Fields
  const [endTime, setEndTime] = useState(initialData?.endTime || '');
  const [isEndTimeManual, setIsEndTimeManual] = useState(!!initialData?.endTime);
  const [cropOrSiteTreated, setCropOrSiteTreated] = useState(initialData?.cropOrSiteTreated || '');
  const [applicationMethod, setApplicationMethod] = useState(initialData?.applicationMethod || 'Ground Broadcast');
  const [treatedAreaUnit, setTreatedAreaUnit] = useState(initialData?.treatedAreaUnit || 'ac');
  const [rei, setRei] = useState(initialData?.rei || '12h');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [complianceProfile] = useState(initialData?.complianceProfile || 'universal');
  const [isSaving, setIsSaving] = useState(false);

  // Auto-calculate total amount applied: sum ALL products' per-product totals
  useEffect(() => {
    const acres = parseFloat(treatedAreaSize);
    if (isNaN(acres) || acres <= 0) return;

    let grandTotal = 0;
    for (const p of products) {
      const rate = parseFloat(p.rate || '0');
      if (isNaN(rate) || rate <= 0) continue;
      const { value } = calculateTotalAmount(rate, acres, p.rateUnit);
      grandTotal += value;
    }
    if (grandTotal > 0) {
      setTotalAmountApplied(grandTotal.toFixed(2).replace(/\.?0+$/, ''));
    }
  }, [products, treatedAreaSize]);

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
    setStartTime(now.toTimeString().slice(0, 5));
    setEndTime('');
    setIsEndTimeManual(false);
    setCropOrSiteTreated('');
    setApplicationMethod('Ground Broadcast');
    setTreatedAreaUnit('ac');
    setRei('12h');
    setNotes('');
    setSiteAddress(field.name);
    setTreatedAreaSize(field.acreage.toString());
    setTargetPest('grass/broadleaves');
    setTotalAmountApplied('');
    setMixtureRate('');
    setTotalMixtureVolume('');
    setIsPremixed(false);
    setManualWindDirection('');
    setProducts([{ ui_id: crypto.randomUUID(), product: '', rate: '', rateUnit: 'oz/ac', epaRegNumber: '', activeIngredients: '', totalProductAmount: '', totalProductUnit: 'gal' }]);
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
      }) || [{ ui_id: crypto.randomUUID(), product: '', rate: '', rateUnit: 'oz/ac', epaRegNumber: '', activeIngredients: '', totalProductAmount: '', totalProductUnit: 'gal' }]);
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
      // Don't override totalAmountApplied here — the useEffect above will recalculate it
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
        const acres = parseFloat(treatedAreaSize);
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
    setProducts(prev => [...prev, { ui_id: crypto.randomUUID(), product: '', rate: '', rateUnit: 'oz/ac', epaRegNumber: '' }]);
  };

  const removeProduct = (i: number) => {
    setProducts(prev => prev.filter((_, idx) => idx !== i));
  };

  const [showValidation, setShowValidation] = useState(false);

  const isMinimumValid = products.length > 0 && products.some(p => p.product.trim()) && !!sprayDate;

  const isFullyCompliant =
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
    products.every(p => p.epaRegNumber?.trim());

  const missingComplianceFields: string[] = [];
  if (!products.every(p => p.product.trim())) missingComplianceFields.push('Product name(s)');
  if (!startTime.trim()) missingComplianceFields.push('Start time');
  if (!endTime.trim()) missingComplianceFields.push('End time');
  if (!weather || weather.isError) missingComplianceFields.push('Weather data');
  if (!applicatorName.trim()) missingComplianceFields.push('Cert. applicator');
  if (!licenseNumber.trim()) missingComplianceFields.push('License #');
  if (!manualWindDirection.trim()) missingComplianceFields.push('Wind direction');
  if (!cropOrSiteTreated.trim()) missingComplianceFields.push('Crop / site treated');
  if (!applicationMethod.trim()) missingComplianceFields.push('Application method');
  if (!equipmentId.trim()) missingComplianceFields.push('Equipment ID');
  if (!products.every(p => p.epaRegNumber?.trim())) missingComplianceFields.push('EPA Reg # (one or more products)');

  const handleSubmit = async () => {
    if (!isMinimumValid) {
      setShowValidation(true);
      toast.error('Enter at least one product name and an application date to save.');
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

      const data = {
        fieldId: field.id,
        fieldName: field.name,
        products: products.filter(p => p.product.trim()).map(p => ({
          ...p,
          totalProductAmount: p.totalProductAmount || undefined,
          totalProductUnit: p.totalProductUnit || 'gal'
        })),
        windSpeed: weather?.wind || initialData?.windSpeed || 0,
        temperature: weather?.temp || initialData?.temperature || 0,
        applicatorName: applicatorName.trim(),
        licenseNumber: licenseNumber.trim(),
        epaRegNumber: products[0]?.epaRegNumber,
        targetPest: targetPest.trim() || undefined,
        windDirection: manualWindDirection || weather?.windDirection || initialData?.windDirection,
        relativeHumidity: weather?.humidity || initialData?.relativeHumidity || 0,
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

          <Accordion type="single" collapsible className="w-full" defaultValue="compliance">
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
                      <Label htmlFor="startTime" className="text-[10px] font-mono text-muted-foreground uppercase">Start Time *</Label>
                      <Input id="startTime" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !startTime.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="endTime" className="text-[10px] font-mono text-muted-foreground uppercase">End Time *</Label>
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] font-mono text-muted-foreground">MANUAL</span>
                          <Switch id="endTimeManual" checked={isEndTimeManual} onCheckedChange={setIsEndTimeManual} className="scale-75 h-4 w-7" />
                        </div>
                      </div>
                      <Input id="endTime" type="time" value={endTime} onChange={e => { setEndTime(e.target.value); setIsEndTimeManual(true); }} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !endTime.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <MapPin size={12} /> site & crop
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-1">
                      <Label htmlFor="cropTreated" className="text-[10px] font-mono text-muted-foreground uppercase">Crop / Site Treated *</Label>
                      <Input id="cropTreated" value={cropOrSiteTreated} onChange={e => setCropOrSiteTreated(e.target.value)} placeholder="e.g. Corn" className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !cropOrSiteTreated.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                    </div>
                    <div>
                      <Label htmlFor="appMethod" className="text-[10px] font-mono text-muted-foreground uppercase">App Method *</Label>
                      <Select value={applicationMethod} onValueChange={setApplicationMethod}>
                        <SelectTrigger className={`mt-0.5 bg-muted border-border text-foreground h-9 text-xs ${showValidation && !applicationMethod.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`}>
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
                      <Label htmlFor="treatedArea" className="text-[10px] font-mono text-muted-foreground uppercase">Treated Area Size *</Label>
                      <div className="flex gap-1">
                        <Input id="treatedArea" value={treatedAreaSize} onChange={e => updateTreatedArea(e.target.value)} placeholder="80" className={`mt-0.5 bg-muted border-border text-foreground h-9 flex-1 ${showValidation && !treatedAreaSize.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
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
                      <Label htmlFor="targetPest" className="text-[10px] font-mono text-muted-foreground uppercase">Target Pest(s) *</Label>
                      <Input id="targetPest" value={targetPest} onChange={e => setTargetPest(e.target.value)} placeholder="e.g. Pigweed" className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !targetPest.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="totalAmount" className="text-[10px] font-mono text-muted-foreground uppercase">Total Material Applied</Label>
                      <Input id="totalAmount" value={totalAmountApplied} onChange={e => setTotalAmountApplied(e.target.value)} placeholder="Auto-sum" className="mt-0.5 bg-muted border-border text-foreground h-9 font-bold" />
                    </div>
                    <div className="flex items-center space-x-2 pt-5">
                      <Switch id="premixed" checked={isPremixed} onCheckedChange={setIsPremixed} />
                      <Label htmlFor="premixed" className="text-[10px] font-mono text-muted-foreground uppercase">Premixed</Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <User size={12} /> APPLICATORS & SAFETY
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="applicator" className="text-[10px] font-mono text-muted-foreground uppercase">Cert. Applicator *</Label>
                      <Input id="applicator" value={applicatorName} onChange={e => setApplicatorName(e.target.value)} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !applicatorName.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                    </div>
                    <div>
                      <Label htmlFor="license" className="text-[10px] font-mono text-muted-foreground uppercase">License # *</Label>
                      <Input id="license" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !licenseNumber.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="equipmentId" className="text-[10px] font-mono text-muted-foreground uppercase">Equipment ID *</Label>
                      <Input id="equipmentId" value={equipmentId} onChange={e => setEquipmentId(e.target.value)} placeholder="e.g. Miller Nitro" className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !equipmentId.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
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

          <div className={`rounded-lg border p-3 space-y-3 ${weather ? 'border-spray/20 bg-muted/30' : 'border-destructive/30 bg-destructive/5'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${weather ? 'text-spray' : 'text-destructive'}`}>
                Environmental Conditions *
              </span>
              {loading && <Loader2 size={12} className="text-spray animate-spin" />}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[9px] font-mono text-muted-foreground uppercase">Wind Direction *</Label>
                <Select value={manualWindDirection} onValueChange={setManualWindDirection}>
                  <SelectTrigger className={`h-8 bg-background border-border text-xs font-mono ${showValidation && !manualWindDirection.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`}>
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
                <Label className="text-[9px] font-mono text-muted-foreground uppercase text-right block">Wind Speed (mph) *</Label>
                <div className="text-sm font-mono font-bold text-right pt-1">{weather?.wind || 0} mph</div>
              </div>
            </div>

            {weather && (
              <div className="grid grid-cols-2 gap-2 border-t border-border/30 pt-2">
                <div className="space-y-0.5">
                  <div className="text-[9px] font-mono text-muted-foreground uppercase">Temp (°F) *</div>
                  <div className="text-xs font-mono font-bold">{weather.temp}°F</div>
                </div>
                <div className="space-y-0.5 text-right">
                  <div className="text-[9px] font-mono text-muted-foreground uppercase">Humidity (%)</div>
                  <div className="text-xs font-mono font-bold">{weather.humidity}%</div>
                </div>
              </div>
            )}
          </div>
          {showValidation && !isFullyCompliant && isMinimumValid && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 space-y-1">
              <div className="flex items-center gap-2 text-yellow-400 font-mono text-xs font-bold uppercase tracking-wider">
                <AlertTriangle size={14} />
                Record will be saved as incomplete
              </div>
              <p className="text-[10px] text-yellow-300/80 leading-relaxed">
                The following compliance fields are missing. You can complete them later by editing this record.
              </p>
              <ul className="mt-1 space-y-0.5">
                {missingComplianceFields.map(f => (
                  <li key={f} className="text-[10px] font-mono text-yellow-400/80">· {f}</li>
                ))}
              </ul>
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
