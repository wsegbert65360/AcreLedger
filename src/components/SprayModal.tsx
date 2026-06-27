import { useMemo, useState } from 'react';
import { CloudRain, FileDown, AlertTriangle, BookOpen, RefreshCw } from 'lucide-react';

import { SprayWizardConditionsStep } from '@/components/spray/SprayWizardConditionsStep';
import { SprayWizardCoreStep } from '@/components/spray/SprayWizardCoreStep';
import { SprayWizardMixStep } from '@/components/spray/SprayWizardMixStep';
import { SprayWizardNav } from '@/components/spray/SprayWizardNav';
import { SprayWizardReviewStep } from '@/components/spray/SprayWizardReviewStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { WizardDialogFooter } from '@/components/wizard/WizardDialogFooter';
import { WizardStepLayout } from '@/components/wizard/WizardNav';
import { useSprayForm } from '@/hooks/useSprayForm';
import { generateSprayPDF } from '@/lib/sprayExport';
import { useFarm } from '@/store/farmStore';
import { type Field, type SprayRecord } from '@/types/farm';
import { native } from '@/lib/native';
interface SprayModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: SprayRecord;
  mode?: 'edit' | 'duplicate';
}

function SprayModal({ field, open, onClose, initialData, mode = 'edit' }: SprayModalProps) {
  const isDuplicate = mode === 'duplicate' && !!initialData;
  const { sprayRecipes, farmName, viewingSeason } = useFarm();
  const form = useSprayForm({ field, open, onClose, initialData, mode });

  const [showMissingChecklist, setShowMissingChecklist] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(false);

  const {
    step, WIZARD_STEPS, canGoNext, canGoBack, goNext, goBack, goToStep,
    isSaving, isMinimumValid, isFullyCompliant, missingComplianceFields,
    handleSubmit
  } = form;

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  const handleNext = () => {
    if (step === 'review') {
      handleSubmit();
      return;
    }
    goNext();
  };

  const stepTitle = {
    core: 'Core Info',
    mix: 'Chemical Mix',
    conditions: 'Conditions',
    review: 'Review & Submit'
  }[step];

  const extraActions = useMemo(() => {
    if (step !== 'review' || form.isQuickMode) return undefined;

    const exportBtn = initialData && (
      <Button
        variant="outline"
        onClick={() => generateSprayPDF([initialData], farmName)}
        className="touch-target w-full border-spray/30 py-6 text-base font-bold text-spray hover:bg-spray/10"
      >
        <FileDown size={20} className="mr-2" />
        Export PDF
      </Button>
    );

    const logAnotherBtn = (!initialData || isDuplicate) && (
      <Button
        variant="outline"
        onClick={() => handleSubmit(true)}
        disabled={isSaving || !isMinimumValid}
        className="touch-target w-full border-spray/30 py-6 text-base font-bold text-spray hover:bg-spray/10"
      >
        Save & Log Another
      </Button>
    );

    if (logAnotherBtn || exportBtn) {
      return (
        <div className="flex flex-col gap-2 w-full">
          {logAnotherBtn}
          {exportBtn}
        </div>
      );
    }

    return undefined;
  }, [step, initialData, isDuplicate, isSaving, isMinimumValid, farmName, handleSubmit, form.isQuickMode]);

  return (
    <>
    <Dialog open={open} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="bg-card border-spray/30 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between w-full text-spray font-bold flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CloudRain size={20} />
              <span>{isDuplicate ? 'Duplicate' : initialData ? 'Edit' : 'Spray'} — {field.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  form.setIsQuickMode(!form.isQuickMode);
                  native.haptic.light();
                }}
                className="text-[10px] font-bold uppercase border border-spray/30 px-2 py-0.5 rounded-lg text-spray bg-spray/5 hover:bg-spray/10 transition-colors mr-1 flex items-center gap-1"
              >
                🚜 {form.isQuickMode ? 'Wizard View' : 'In-Cab View'}
              </button>
              {!form.isQuickMode && (
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-spray/10 text-spray border border-spray/20">
                  {stepTitle}
                </span>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {initialData
              ? 'Update the details of this spray application across the wizard steps.'
              : 'Log a new pesticide or fertilizer spray application for this field across the wizard steps.'}
          </DialogDescription>
        </DialogHeader>

        {!form.isQuickMode && (
          <SprayWizardNav steps={WIZARD_STEPS} currentStep={step} onStepClick={goToStep} />
        )}

        {/* Collapsible compliance checklist */}
        {!form.isQuickMode && !isFullyCompliant && (
          <div className="bg-yellow-500/5 border border-yellow-500/15 rounded-xl p-2.5 my-1.5 animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowMissingChecklist(!showMissingChecklist)}
              className="w-full flex items-center justify-between text-[11px] font-mono font-bold text-yellow-600 uppercase"
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-yellow-600" />
                {missingComplianceFields.length} Compliance {missingComplianceFields.length === 1 ? 'Field' : 'Fields'} Missing
              </span>
              <span className="underline">{showMissingChecklist ? 'Hide Checklist' : 'Show Checklist'}</span>
            </button>
            {showMissingChecklist && (
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground font-mono">
                {missingComplianceFields.map((field) => (
                  <li key={field} className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                    <span>{field}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {form.suggestedSpray && !initialData && !form.isQuickMode && (
          <div className="bg-plant/10 border border-plant/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-foreground my-2 animate-in fade-in duration-200 shadow-sm shadow-plant/5">
            <div className="flex-grow leading-relaxed">
              Prefilled from last spray on this field — tap to change details: <span className="font-bold text-plant">{form.suggestedSpray.products?.[0]?.product || 'Pesticide'}</span>.
            </div>
            <button
              type="button"
              onClick={() => {
                form.setProducts([{ product: '', epaRegNumber: '', activeIngredients: '', rate: '', rateUnit: 'oz/ac', totalProductAmount: '', totalProductUnit: 'gal', ui_id: crypto.randomUUID() }]);
                form.setNotes('');
                form.setTargetPest('');
                native.haptic.light();
              }}
              className="text-plant hover:underline font-bold shrink-0"
            >
              Clear
            </button>
          </div>
        )}

        {form.isQuickMode ? (
          <div className="space-y-4 pt-2 animate-in fade-in duration-200">
            {/* Prefilled banner from last spray (quick mode version) */}
            {form.suggestedSpray && !initialData && (
              <div className="bg-plant/10 border border-plant/20 rounded-xl p-2.5 flex items-center justify-between text-xs text-foreground">
                <span>Prefilled from last spray on this field</span>
                <button
                  type="button"
                  onClick={() => {
                    form.setProducts([{ product: '', epaRegNumber: '', activeIngredients: '', rate: '', rateUnit: 'oz/ac', totalProductAmount: '', totalProductUnit: 'gal', ui_id: crypto.randomUUID() }]);
                    form.setNotes('');
                    form.setTargetPest('');
                    native.haptic.light();
                  }}
                  className="text-plant hover:underline font-bold"
                >
                  Clear Form
                </button>
              </div>
            )}

            {/* Recipe Loader */}
            <div className="bg-spray/5 border border-spray/10 p-3 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="quickRecipe" className="text-xs font-semibold text-spray flex items-center gap-1 cursor-pointer">
                  <BookOpen size={14} /> Load Saved Recipe
                </Label>
                {sprayRecipes.length === 0 && (
                  <span className="text-[10px] text-muted-foreground font-mono">None saved</span>
                )}
              </div>
              {sprayRecipes.length > 0 ? (
                <Select value={form.selectedRecipeId} onValueChange={form.handleRecipeSelect}>
                  <SelectTrigger id="quickRecipe" className="h-11 bg-background border-spray/20 hover:border-spray/40 text-foreground text-sm font-semibold">
                    <SelectValue placeholder="Load a saved recipe..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sprayRecipes.map(r => (
                      <SelectItem key={r.id} value={r.id} className="text-xs font-semibold">{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-[10px] text-muted-foreground leading-normal">
                  No recipes saved. You can save your chemical mix after logging this spray.
                </p>
              )}
            </div>

            {/* Products summary list */}
            <div className="bg-muted/40 p-3 rounded-xl border border-border/50 space-y-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Chemicals to Spray</span>
              {form.products.map((p, idx) => (
                <div key={p.ui_id || idx} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    value={p.product}
                    onChange={e => form.updateProduct(idx, 'product', e.target.value)}
                    placeholder="Trade Name (e.g. Roundup)"
                    className="h-11 bg-background col-span-8 font-semibold text-sm"
                  />
                  <div className="col-span-4 flex gap-1 items-center">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={p.rate}
                      onChange={e => form.updateProduct(idx, 'rate', e.target.value)}
                      placeholder="Rate"
                      className="h-11 bg-background text-center px-1 font-mono w-14"
                    />
                    <span className="text-[10px] font-mono text-muted-foreground">{p.rateUnit}</span>
                  </div>
                </div>
              ))}
              {form.products.length > 0 && form.products[0].product && (
                <div className="flex gap-2">
                  <Input
                    id="quickEpaReg"
                    value={form.products[0].epaRegNumber || ''}
                    onChange={e => form.updateProduct(0, 'epaRegNumber', e.target.value)}
                    placeholder="EPA Reg # (e.g. 524-549)"
                    className="h-11 bg-background text-xs font-mono"
                  />
                  <Input
                    id="quickTargetPest"
                    value={form.targetPest}
                    onChange={e => form.setTargetPest(e.target.value)}
                    placeholder="Target Pest"
                    className="h-11 bg-background text-xs font-semibold"
                  />
                </div>
              )}
            </div>

            {/* Wind conditions section */}
            <div className="bg-muted/40 p-3 rounded-xl border border-border/50 space-y-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Wind Speed & Direction</span>

              {/* Wind speed selector flanked with large buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(form.manualWindSpeed) || 0;
                    form.setManualWindSpeed(String(Math.max(0, current - 1)));
                    native.haptic.light();
                  }}
                  className="h-12 w-12 bg-background hover:bg-muted text-foreground border border-border rounded-xl text-lg font-bold flex items-center justify-center active:scale-95 transition-all"
                >
                  -
                </button>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.manualWindSpeed}
                  onChange={e => form.setManualWindSpeed(e.target.value)}
                  placeholder="0 mph"
                  className="h-12 text-center text-base font-mono font-bold flex-1"
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(form.manualWindSpeed) || 0;
                    form.setManualWindSpeed(String(current + 1));
                    native.haptic.light();
                  }}
                  className="h-12 w-12 bg-background hover:bg-muted text-foreground border border-border rounded-xl text-lg font-bold flex items-center justify-center active:scale-95 transition-all"
                >
                  +
                </button>
              </div>

              {/* Wind Direction 3x3 Grid (Glove-friendly, 1 tap select!) */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {['NW', 'N', 'NE', 'W', 'CALM', 'E', 'SW', 'S', 'SE'].map(dir => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      form.setManualWindDirection(dir);
                      native.haptic.light();
                    }}
                    className={`py-2 text-xs font-bold border rounded-lg transition-all active:scale-95 ${
                      form.manualWindDirection === dir
                        ? 'bg-spray text-white border-spray shadow-sm shadow-spray/25'
                        : 'bg-background text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {dir}
                  </button>
                ))}
              </div>

              {parseFloat(form.manualWindSpeed) > 10 && (
                <div className="flex items-start gap-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2 text-yellow-600 animate-in fade-in duration-200 mt-1">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-yellow-700/80 leading-normal font-semibold">
                    Warning: Wind ({form.manualWindSpeed} mph) exceeds 10 mph. High drift risk.
                  </p>
                </div>
              )}

              {/* Weather fetching inline row */}
              <div className="flex items-center justify-between border-t border-border/30 pt-2 mt-1">
                <span className="text-[10px] font-mono text-muted-foreground">
                  Temp: <span className="font-bold text-foreground">{form.weather ? `${form.weather.temp}°F` : '—'}</span> &middot; Hum: <span className="font-bold text-foreground">{form.weather ? `${form.weather.humidity}%` : '—'}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={form.isRecovering || !field.lat || !field.lng}
                  onClick={form.handleRecoverWeather}
                  className="h-6 px-1.5 text-[10px] font-bold text-spray"
                >
                  <RefreshCw size={10} className={`mr-1 ${form.isRecovering ? 'animate-spin' : ''}`} />
                  PULL CURRENT WEATHER
                </Button>
              </div>
            </div>

            {/* Settings & Applicator information */}
            <div className="bg-muted/40 p-3 rounded-xl border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Applicator & Equipment</span>
                <button
                  type="button"
                  onClick={() => setShowQuickSettings(!showQuickSettings)}
                  className="text-xs text-spray font-bold hover:underline"
                >
                  {showQuickSettings ? 'Hide Settings' : 'Edit Settings'}
                </button>
              </div>
              {!showQuickSettings ? (
                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground">
                  <div>App: <span className="font-bold text-foreground">{form.applicatorName || '—'}</span></div>
                  <div>Lic: <span className="font-bold text-foreground">{form.licenseNumber || '—'}</span></div>
                  <div className="col-span-2">Equip: <span className="font-bold text-foreground">{form.equipmentId || '—'}</span></div>
                </div>
              ) : (
                <div className="space-y-2 pt-1 animate-in fade-in duration-200">
                  <div>
                    <Label htmlFor="quickApplicator" className="text-[10px] font-mono text-muted-foreground uppercase">Applicator Name</Label>
                    <Input
                      id="quickApplicator"
                      value={form.applicatorName}
                      onChange={e => form.setApplicatorName(e.target.value)}
                      className="h-11 bg-background text-sm font-semibold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="quickLicense" className="text-[10px] font-mono text-muted-foreground uppercase">License #</Label>
                      <Input
                        id="quickLicense"
                        value={form.licenseNumber}
                        onChange={e => form.setLicenseNumber(e.target.value)}
                        className="h-11 bg-background text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <Label htmlFor="quickEquipment" className="text-[10px] font-mono text-muted-foreground uppercase">Equipment ID</Label>
                      <Input
                        id="quickEquipment"
                        value={form.equipmentId}
                        onChange={e => form.setEquipmentId(e.target.value)}
                        className="h-11 bg-background text-sm font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Compliance warning if incomplete */}
            {!isFullyCompliant && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-2.5 flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-yellow-600 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-yellow-600" />
                  {missingComplianceFields.length} compliance fields missing. Will save as incomplete.
                </span>
              </div>
            )}

            {/* Save Button for Quick Mode */}
            <Button
              onClick={() => handleSubmit()}
              disabled={isSaving || !isMinimumValid}
              className="w-full h-14 bg-spray hover:bg-spray/90 text-white rounded-xl font-bold text-base shadow-lg shadow-spray/20 active:scale-95 transition-all flex items-center justify-center gap-2 mt-4"
            >
              {isSaving ? <RefreshCw className="animate-spin" size={20} /> : <CloudRain size={20} />}
              <span>{isSaving ? 'Saving Record...' : 'LOG SPRAY RECORD'}</span>
            </Button>
          </div>
        ) : (
          <>
            <WizardStepLayout>
              {step === 'core' && <SprayWizardCoreStep
                sprayDate={form.sprayDate}
                startTime={form.startTime}
                endTime={form.endTime}
                isEndTimeManual={form.isEndTimeManual}
                applicatorName={form.applicatorName}
                licenseNumber={form.licenseNumber}
                targetPest={form.targetPest}
                cropOrSiteTreated={form.cropOrSiteTreated}
                applicationMethod={form.applicationMethod}
                siteAddress={form.siteAddress}
                involvedTechnicians={form.involvedTechnicians}
                equipmentId={form.equipmentId}
                rei={form.rei}
                notes={form.notes}
                photoBase64={form.photoBase64}
                photoType={form.photoType}
                sensitiveAreaCheck={form.sensitiveAreaCheck}
                sensitiveAreaNotes={form.sensitiveAreaNotes}
                showValidation={form.showValidation}
                setSprayDate={form.setSprayDate}
                setStartTime={form.setStartTime}
                setEndTime={form.setEndTime}
                setIsEndTimeManual={form.setIsEndTimeManual}
                setApplicatorName={form.setApplicatorName}
                setLicenseNumber={form.setLicenseNumber}
                setTargetPest={form.setTargetPest}
                setCropOrSiteTreated={form.setCropOrSiteTreated}
                setApplicationMethod={form.setApplicationMethod}
                setSiteAddress={form.setSiteAddress}
                setInvolvedTechnicians={form.setInvolvedTechnicians}
                setEquipmentId={form.setEquipmentId}
                setRei={form.setRei}
                setNotes={form.setNotes}
                setPhotoBase64={form.setPhotoBase64}
                setPhotoType={form.setPhotoType}
                setSensitiveAreaCheck={form.setSensitiveAreaCheck}
                setSensitiveAreaNotes={form.setSensitiveAreaNotes}
              />}

              {step === 'mix' && <SprayWizardMixStep
                sprayRecipes={sprayRecipes}
                selectedRecipeId={form.selectedRecipeId}
                products={form.products}
                showValidation={form.showValidation}
                onRecipeSelect={form.handleRecipeSelect}
                updateProduct={form.updateProduct}
                addProduct={form.addProduct}
                removeProduct={form.removeProduct}
              />}

              {step === 'conditions' && <SprayWizardConditionsStep
                fieldLat={field.lat}
                fieldLng={field.lng}
                weather={form.weather}
                loading={form.loading}
                isRecovering={form.isRecovering}
                manualWindDirection={form.manualWindDirection}
                manualWindSpeed={form.manualWindSpeed}
                treatedAreaSize={form.treatedAreaSize}
                treatedAreaUnit={form.treatedAreaUnit}
                totalAmountApplied={form.totalAmountApplied}
                mixtureRate={form.mixtureRate}
                totalMixtureVolume={form.totalMixtureVolume}
                isPremixed={form.isPremixed}
                showValidation={form.showValidation}
                onRecoverWeather={form.handleRecoverWeather}
                setManualWindDirection={form.setManualWindDirection}
                setManualWindSpeed={form.setManualWindSpeed}
                setTreatedAreaSize={form.setTreatedAreaSize}
                setTreatedAreaUnit={form.setTreatedAreaUnit}
                setTotalAmountApplied={form.setTotalAmountApplied}
                setMixtureRate={form.setMixtureRate}
                setTotalMixtureVolume={form.setTotalMixtureVolume}
                setIsPremixed={form.setIsPremixed}
              />}

              {step === 'review' && <SprayWizardReviewStep
                fieldName={field.name}
                seasonYear={initialData && !isDuplicate ? initialData.seasonYear : viewingSeason}
                isExisting={!!initialData}
                sprayDate={form.sprayDate}
                startTime={form.startTime}
                endTime={form.endTime}
                applicatorName={form.applicatorName}
                licenseNumber={form.licenseNumber}
                equipmentId={form.equipmentId}
                targetPest={form.targetPest}
                cropOrSiteTreated={form.cropOrSiteTreated}
                applicationMethod={form.applicationMethod}
                treatedAreaSize={form.treatedAreaSize}
                treatedAreaUnit={form.treatedAreaUnit}
                products={form.products}
                weather={form.weather}
                manualWindDirection={form.manualWindDirection}
                manualWindSpeed={form.manualWindSpeed}
                isFullyCompliant={isFullyCompliant}
                missingComplianceFields={missingComplianceFields}
                notes={form.notes}
                photoBase64={form.photoBase64}
                photoType={form.photoType}
              />}
            </WizardStepLayout>

            <WizardDialogFooter
              canGoBack={canGoBack}
              canContinue={step === 'review' || canGoNext}
              isFinalStep={step === 'review'}
              isSaving={isSaving}
              onBack={goBack}
              onPrimary={handleNext}
              finalContent={
                !isMinimumValid
                  ? 'Enter Product Name to Save'
                  : !isFullyCompliant
                    ? (isDuplicate ? 'Log Duplicate (Incomplete)' : initialData ? 'Update (Incomplete)' : 'Save (Incomplete)')
                    : (isDuplicate ? 'Log Duplicate' : initialData ? 'Update Spray Record' : 'Save Spray Record')
              }
              showFinalWarningIcon={step === 'review' && isMinimumValid && !isFullyCompliant}
              primaryClassName={
                isFullyCompliant || step !== 'review'
                  ? 'bg-spray text-white hover:bg-spray/90 glow-spray'
                  : 'bg-yellow-600 text-white hover:bg-yellow-500'
              }
              extraActions={extraActions}
            />
          </>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={form.recipeDialogOpen} onOpenChange={(open) => { if (!open) form.cancelRecipeDialog(); }}>
      <DialogContent className="bg-card max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-spray font-bold flex items-center gap-2">
            <BookOpen size={18} />
            Save Mix as Recipe
          </DialogTitle>
          <DialogDescription>
            Name this chemical mix to quickly reload it for future sprays.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <Label htmlFor="recipeName" className="text-xs font-semibold text-muted-foreground">
            Recipe Name
          </Label>
          <Input
            id="recipeName"
            name="recipeName"
            value={form.recipeName}
            onChange={e => form.setRecipeName(e.target.value)}
            placeholder="e.g. Corn Pre-Emerge Burndown"
            autoFocus
            className="h-11 bg-muted border-border text-foreground"
            onKeyDown={e => {
              if (e.key === 'Enter' && form.recipeName.trim() && !form.isSavingRecipe) {
                e.preventDefault();
                form.confirmSaveRecipe();
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={form.cancelRecipeDialog} disabled={form.isSavingRecipe}>
            Cancel
          </Button>
          <Button
            onClick={form.confirmSaveRecipe}
            disabled={!form.recipeName.trim() || form.isSavingRecipe}
            className="bg-spray text-white hover:bg-spray/90"
          >
            {form.isSavingRecipe ? 'Saving…' : 'Save Recipe'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

export default SprayModal;
