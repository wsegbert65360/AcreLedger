import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { Field, SprayRecipeProduct, SprayRecord } from '@/types/farm';
import { WeatherService } from '@/services/WeatherService';
import { WeatherData } from '@/types/weather';
import { CloudRain, Loader2, Clock, MapPin, User, FileText, X, Plus } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface SprayModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: SprayRecord;
}

export default function SprayModal({ field, open, onClose, initialData }: SprayModalProps) {
  const { addSprayRecord, updateSprayRecord, sprayRecipes, session } = useFarm();
  const userPrefix = session?.user?.id?.slice(0, 8) || "local";
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<SprayRecipeProduct[]>(initialData?.products || [{ product: '', rate: '', rateUnit: 'oz/ac', epaRegNumber: '' }]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [applicatorName, setApplicatorName] = useState(() => initialData?.applicatorName || localStorage.getItem(`al_applicator_name_${userPrefix}`) || '');
  const [licenseNumber, setLicenseNumber] = useState(() => initialData?.licenseNumber || localStorage.getItem(`al_license_number_${userPrefix}`) || '');
  const [targetPest, setTargetPest] = useState(initialData?.targetPest || 'grass/broadleaves');
  const [sprayDate, setSprayDate] = useState(initialData?.sprayDate || new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(() => initialData?.startTime || new Date().toTimeString().slice(0, 5));
  const [involvedTechnicians, setInvolvedTechnicians] = useState(initialData?.involvedTechnicians || '');
  const [siteAddress, setSiteAddress] = useState(initialData?.siteAddress || field.name);
  const [treatedAreaSize, setTreatedAreaSize] = useState(initialData?.treatedAreaSize || field.acreage.toString());
  const [totalAmountApplied, setTotalAmountApplied] = useState(initialData?.totalAmountApplied || '');
  const [mixtureRate, setMixtureRate] = useState(initialData?.mixtureRate || '');
  const [totalMixtureVolume, setTotalMixtureVolume] = useState(initialData?.totalMixtureVolume || '');
  const [equipmentId, setEquipmentId] = useState(() => initialData?.equipmentId || localStorage.getItem(`al_equipment_id_${userPrefix}`) || 'Miller Nitro');
  const [manualWindDirection, setManualWindDirection] = useState<string>(initialData?.windDirection || '');
  const [isPremixed, setIsPremixed] = useState(initialData?.isPremixed || false);

  const selectedRecipe = sprayRecipes.find(r => r.id === selectedRecipeId);

  // Auto-calculate total amount based on first product or general rate if needed 
  // (In reality, multiple products might have different rates, but total volume is usually per field)
  useEffect(() => {
    const rate = parseFloat(products[0]?.rate || '0');
    const acres = parseFloat(treatedAreaSize);
    if (!isNaN(rate) && !isNaN(acres)) {
      // Only auto-calc if not manually overridden or as a hint
      // For now keeping simple auto-fill logic
      setTotalAmountApplied((rate * acres).toFixed(1));
    }
  }, [products, treatedAreaSize]);

  const resetComplianceFields = () => {
    const now = new Date();
    setStartTime(now.toTimeString().slice(0, 5));
    setInvolvedTechnicians('');
    setSiteAddress(field.name);
    setTreatedAreaSize(field.acreage.toString());
    setTargetPest('grass/broadleaves');
    setTotalAmountApplied('');
    setMixtureRate('');
    setTotalMixtureVolume('');
    setIsPremixed(false);
    setManualWindDirection('');
    setProducts([{ product: '', rate: '', rateUnit: 'oz/ac', epaRegNumber: '' }]);
  };

  useEffect(() => {
    if (open) {
      setLoading(true);
      WeatherService.fetchCurrentWeather(`${field.lat},${field.lng}`).then(w => {
        setWeather(w);
        if (w && !manualWindDirection) setManualWindDirection(w.windDirection);
        setLoading(false);
      });
    }
  }, [open, field.lat, field.lng]);

  const handleRecipeSelect = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    const recipe = sprayRecipes.find(r => r.id === recipeId);
    if (recipe) {
      setProducts(recipe.products.map(p => ({ ...p, epaRegNumber: p.epaRegNumber || '' })));
      if (recipe.applicatorName) setApplicatorName(recipe.applicatorName);
      if (recipe.licenseNumber) setLicenseNumber(recipe.licenseNumber);
      if (recipe.targetPest) setTargetPest(recipe.targetPest);
    }
  };

  const updateProduct = (i: number, field: keyof SprayRecipeProduct, value: string) => {
    setProducts(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };

  const addProduct = () => {
    setProducts(prev => [...prev, { product: '', rate: '', rateUnit: 'oz/ac', epaRegNumber: '' }]);
  };

  const removeProduct = (i: number) => {
    setProducts(prev => prev.filter((_, idx) => idx !== i));
  };

  const [showValidation, setShowValidation] = useState(false);

  const isFormValid = products.length > 0 &&
    products.every(p => p.product.trim() && p.epaRegNumber?.trim()) &&
    startTime.trim() &&
    (!!weather && !weather.isError) &&
    applicatorName.trim() &&
    licenseNumber.trim() &&
    manualWindDirection.trim() &&
    equipmentId.trim();

  const handleSubmit = () => {
    if (!isFormValid) {
      setShowValidation(true);
      toast.error('Please complete all required compliance fields');
      return;
    }

    if (applicatorName.trim()) localStorage.setItem(`al_applicator_name_${userPrefix}`, applicatorName.trim());
    if (licenseNumber.trim()) localStorage.setItem(`al_license_number_${userPrefix}`, licenseNumber.trim());
    if (equipmentId.trim()) localStorage.setItem(`al_equipment_id_${userPrefix}`, equipmentId.trim());

    const data = {
      fieldId: field.id,
      fieldName: field.name,
      product: products.map(p => p.product).join(', '),
      products: products.filter(p => p.product.trim()),
      windSpeed: weather?.wind || initialData?.windSpeed || 0,
      temperature: weather?.temp || initialData?.temperature || 0,
      applicatorName: applicatorName.trim(),
      licenseNumber: licenseNumber.trim(),
      epaRegNumber: products[0]?.epaRegNumber, // Fallback for legacy
      targetPest: targetPest.trim() || undefined,
      windDirection: manualWindDirection || weather?.windDirection || initialData?.windDirection,
      relativeHumidity: weather?.humidity || initialData?.relativeHumidity || 0,
      sprayDate: sprayDate || undefined,
      // Regulatory fields
      startTime: startTime || undefined,
      involvedTechnicians: involvedTechnicians.trim() || undefined,
      siteAddress: siteAddress.trim() || undefined,
      treatedAreaSize: treatedAreaSize.trim() || undefined,
      totalAmountApplied: totalAmountApplied.trim() || undefined,
      mixtureRate: mixtureRate.trim() || undefined,
      totalMixtureVolume: totalMixtureVolume.trim() || undefined,
      equipmentId: equipmentId.trim() || undefined,
      isPremixed,
    };

    if (initialData) {
      updateSprayRecord({ ...initialData, ...data });
    } else {
      addSprayRecord(data);
    }
    if (field.id) {
      WeatherService.triggerBackfill(field.id);
    }
    
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-spray/30 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-spray font-bold">
            <CloudRain size={20} />
            {initialData ? 'Edit' : 'Spray Application'} — {field.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Main Info */}
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
                <div key={i} className="bg-muted p-2.5 rounded-md border border-border/50 relative">
                  {products.length > 1 && (
                    <button onClick={() => removeProduct(i)} className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 shadow-md hover:bg-destructive/80 transition-colors">
                      <X size={12} />
                    </button>
                  )}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-1">
                        <Label htmlFor={`productName-${i}`} className="text-[9px] font-mono text-muted-foreground uppercase">Trade Name</Label>
                        <Input
                          id={`productName-${i}`}
                          name={`productName-${i}`}
                          value={p.product}
                          onChange={e => updateProduct(i, 'product', e.target.value)}
                          placeholder="Roundup"
                          className={`mt-0.5 bg-background border-border text-foreground text-xs h-8 ${showValidation && !p.product.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`}
                        />
                      </div>
                      <div className="col-span-1">
                        <Label htmlFor={`epaReg-${i}`} className="text-[9px] font-mono text-muted-foreground uppercase">EPA Reg #</Label>
                        <Input
                          id={`epaReg-${i}`}
                          name={`epaReg-${i}`}
                          value={p.epaRegNumber}
                          onChange={e => updateProduct(i, 'epaRegNumber', e.target.value)}
                          placeholder="524-549"
                          className={`mt-0.5 bg-background border-border text-foreground text-xs h-8 ${showValidation && !p.epaRegNumber?.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor={`appRate-${i}`} className="text-[9px] font-mono text-muted-foreground uppercase">App Rate</Label>
                        <div className="flex gap-1">
                          <Input id={`appRate-${i}`} name={`appRate-${i}`} value={p.rate} onChange={e => updateProduct(i, 'rate', e.target.value)} placeholder="22" className="mt-0.5 bg-background border-border text-foreground text-xs h-7 px-1 flex-1" />
                          <Input value={p.rateUnit} onChange={e => updateProduct(i, 'rateUnit', e.target.value)} placeholder="oz/ac" className="mt-0.5 bg-background border-border text-foreground text-xs h-7 px-1 w-12" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <Button onClick={addProduct} variant="outline" size="sm" className="w-full border-dashed border-spray/30 text-spray text-[10px] h-8 font-bold">
                <Plus size={12} className="mr-1" /> ADD ANOTHER HERBICIDE
              </Button>
            </div>

            <div>
              <Label htmlFor="sprayDate" className="text-muted-foreground font-mono text-xs font-bold">APPLICATION DATE *</Label>
              <Input id="sprayDate" name="sprayDate" type="date" value={sprayDate} onChange={e => setSprayDate(e.target.value)} className="mt-1 bg-muted border-border text-foreground" />
            </div>
          </div>

          {/* Compliance Accordion */}
          <Accordion type="single" collapsible className="w-full" defaultValue="compliance">
            <AccordionItem value="compliance" className="border-spray/20">
              <AccordionTrigger className="text-spray font-mono text-xs font-bold hover:no-underline py-2">
                REGULATORY COMPLIANCE DETAILS (2 CSR 70-25.120)
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                {/* 1. Timing */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <Clock size={12} /> Timing
                  </div>
                  <div>
                    <Label htmlFor="startTime" className="text-[10px] font-mono text-muted-foreground">START TIME *</Label>
                    <Input id="startTime" name="startTime" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !startTime.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                  </div>
                </div>

                {/* 2. Site */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <MapPin size={12} /> Site Details
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-1">
                      <Label htmlFor="siteAddress" className="text-[10px] font-mono text-muted-foreground">SITE DESCRIPTION / ADDR</Label>
                      <Input id="siteAddress" name="siteAddress" value={siteAddress} onChange={e => setSiteAddress(e.target.value)} placeholder="Field name or addr" className="mt-0.5 bg-muted border-border text-foreground h-9" />
                    </div>
                    <div>
                      <Label htmlFor="treatedArea" className="text-[10px] font-mono text-muted-foreground">TREATED AREA SIZE</Label>
                      <Input id="treatedArea" name="treatedArea" value={treatedAreaSize} onChange={e => setTreatedAreaSize(e.target.value)} placeholder="e.g. 80 ac" className="mt-0.5 bg-muted border-border text-foreground h-9" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <FileText size={12} /> Use Specifics
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label htmlFor="totalAmount" className="text-[10px] font-mono text-muted-foreground uppercase tracking-tight">TOTAL PRODUCT APPLIED (ACROSS ALL HERBICIDES)</Label>
                      <Input id="totalAmount" name="totalAmount" value={totalAmountApplied} onChange={e => setTotalAmountApplied(e.target.value)} placeholder="Auto-calculated sum" className="mt-0.5 bg-muted border-border text-foreground h-9 font-bold" />
                    </div>
                  </div>

                  {/* MDA Mandatory Mixture Fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="mixtureRate" className="text-[10px] font-mono text-muted-foreground uppercase">Mixture Rate</Label>
                      <Input id="mixtureRate" name="mixtureRate" value={mixtureRate} onChange={e => setMixtureRate(e.target.value)} placeholder="e.g. 15 gal/ac" className="mt-0.5 bg-muted border-border text-foreground h-9" />
                    </div>
                    <div>
                      <Label htmlFor="totalVolume" className="text-[10px] font-mono text-muted-foreground uppercase">Total Mixture Vol</Label>
                      <Input id="totalVolume" name="totalVolume" value={totalMixtureVolume} onChange={e => setTotalMixtureVolume(e.target.value)} placeholder="e.g. 1200 gal" className="mt-0.5 bg-muted border-border text-foreground h-9" />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="targetPest" className="text-[10px] font-mono text-muted-foreground">TARGET PEST(S)</Label>
                    <Input id="targetPest" name="targetPest" value={targetPest} onChange={e => setTargetPest(e.target.value)} placeholder="e.g. Pigweed" className="mt-0.5 bg-muted border-border text-foreground h-9" />
                  </div>
                  <div className="flex items-center space-x-2 py-2">
                    <Switch id="premixed" checked={isPremixed} onCheckedChange={setIsPremixed} />
                    <Label htmlFor="premixed" className="text-xs font-mono text-muted-foreground">PREMIXED PRODUCT</Label>
                  </div>
                </div>

                {/* 4. Applicators */}
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    <User size={12} /> Applicators
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="applicator" className="text-[10px] font-mono text-muted-foreground">CERT. APPLICATOR *</Label>
                      <Input id="applicator" name="applicator" value={applicatorName} onChange={e => setApplicatorName(e.target.value)} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !applicatorName.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                    </div>
                    <div>
                      <Label htmlFor="license" className="text-[10px] font-mono text-muted-foreground">LICENSE # *</Label>
                      <Input id="license" name="license" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !licenseNumber.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="technicians" className="text-[10px] font-mono text-muted-foreground">INVOLVED TECHNICIANS / NON-CERTIFIED</Label>
                    <Input id="technicians" name="technicians" value={involvedTechnicians} onChange={e => setInvolvedTechnicians(e.target.value)} placeholder="Name and license of others involved" className="mt-0.5 bg-muted border-border text-foreground h-9" />
                  </div>
                  <div>
                    <Label htmlFor="equipmentId" className="text-[10px] font-mono text-muted-foreground uppercase">Equipment ID (Machine) *</Label>
                    <Input id="equipmentId" name="equipmentId" value={equipmentId} onChange={e => setEquipmentId(e.target.value)} placeholder="e.g. Miller Nitro" className={`mt-0.5 bg-muted border-border text-foreground h-9 ${showValidation && !equipmentId.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Weather (Auto-filled but editable for 8-point validation) */}
          <div className={`rounded-lg border p-3 space-y-3 ${weather ? 'border-spray/20 bg-muted/30' : 'border-destructive/30 bg-destructive/5'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${weather ? 'text-spray' : 'text-destructive'}`}>
                Environmental Conditions (Required)
              </span>
              {loading && <Loader2 size={12} className="text-spray animate-spin" />}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[9px] font-mono text-muted-foreground uppercase">8-Point Wind Direction *</Label>
                <Select value={manualWindDirection} onValueChange={setManualWindDirection}>
                  <SelectTrigger className={`h-8 bg-background border-border text-xs font-mono ${showValidation && !manualWindDirection.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map(dir => (
                      <SelectItem key={dir} value={dir} className="font-mono text-xs">{dir}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[9px] font-mono text-muted-foreground uppercase text-right block">Wind Speed</Label>
                <div className="text-sm font-mono font-bold text-right pt-1">{weather?.wind || 0} mph</div>
              </div>
            </div>

            {weather && (
              <div className="grid grid-cols-2 gap-2 border-t border-border/30 pt-2">
                <div className="space-y-0.5">
                  <div className="text-[9px] font-mono text-muted-foreground uppercase">Temperature</div>
                  <div className="text-xs font-mono font-bold">{weather.temp}°F</div>
                </div>
                <div className="space-y-0.5 text-right">
                  <div className="text-[9px] font-mono text-muted-foreground uppercase">Humidity</div>
                  <div className="text-xs font-mono font-bold">{weather.humidity}%</div>
                </div>
              </div>
            )}

            {!weather && !loading && (
              <div className="text-[10px] font-mono text-destructive">Weather data missing. Please check location settings.</div>
            )}
          </div>
        </div>
        <DialogFooter className="sticky bottom-0 bg-card pt-2">
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || loading}
            className="touch-target w-full bg-spray text-white hover:bg-spray/90 glow-spray font-bold py-6 text-base disabled:opacity-50 disabled:grayscale"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> :
              !isFormValid ? 'Compliance Information Missing' :
                initialData ? 'Update Record' : 'Complete MDA Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

