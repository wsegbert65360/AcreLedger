import { useMemo } from 'react';
import { CloudRain, FileDown } from 'lucide-react';

import { SprayWizardConditionsStep } from '@/components/spray/SprayWizardConditionsStep';
import { SprayWizardCoreStep } from '@/components/spray/SprayWizardCoreStep';
import { SprayWizardMixStep } from '@/components/spray/SprayWizardMixStep';
import { SprayWizardNav } from '@/components/spray/SprayWizardNav';
import { SprayWizardReviewStep } from '@/components/spray/SprayWizardReviewStep';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { WizardDialogFooter } from '@/components/wizard/WizardDialogFooter';
import { WizardStepLayout } from '@/components/wizard/WizardNav';
import { useSprayForm } from '@/hooks/useSprayForm';
import { generateSprayPDF } from '@/lib/sprayExport';
import { useFarm } from '@/store/farmStore';
import { type Field, type SprayRecord } from '@/types/farm';
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
    if (step !== 'review') return undefined;

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
  }, [step, initialData, isDuplicate, isSaving, isMinimumValid, farmName, handleSubmit]);

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="bg-card border-spray/30 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center flex-wrap gap-2 text-spray font-bold">
            <div className="flex items-center gap-2">
              <CloudRain size={20} />
              <span>{isDuplicate ? 'Duplicate' : initialData ? 'Edit' : 'Spray'} — {field.name}</span>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-spray/10 text-spray border border-spray/20">
              {stepTitle}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {initialData
              ? 'Update the details of this spray application across the wizard steps.'
              : 'Log a new pesticide or fertilizer spray application for this field across the wizard steps.'}
          </DialogDescription>
        </DialogHeader>

        <SprayWizardNav steps={WIZARD_STEPS} currentStep={step} onStepClick={goToStep} />

        {form.suggestedSpray && !initialData && (
          <div className="bg-spray/5 border border-spray/20 rounded-lg p-2.5 flex items-start gap-2 text-xs text-foreground my-2 animate-in fade-in duration-200">
            <div className="flex-grow">
              Prefilled from last spray on this field: <span className="font-bold">{form.suggestedSpray.products?.[0]?.product || 'Pesticide'}</span>.
            </div>
            <button
              type="button"
              onClick={() => {
                form.setProducts([{ product: '', epaRegNumber: '', activeIngredients: '', rate: '', rateUnit: 'fl oz/ac', totalProductAmount: '', totalProductUnit: 'gal', ui_id: crypto.randomUUID() }]);
                form.setNotes('');
                form.setTargetPest('');
              }}
              className="text-spray hover:underline font-bold"
            >
              Clear
            </button>
          </div>
        )}

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
      </DialogContent>
    </Dialog>
  );
}

export default SprayModal;
