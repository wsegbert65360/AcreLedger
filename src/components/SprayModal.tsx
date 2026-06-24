import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useFarm } from '@/store/farmStore';
import { Field, SprayRecord } from '@/types/farm';
import { CloudRain, Loader2, ChevronLeft, ChevronRight, FileDown, AlertTriangle } from 'lucide-react';
import { generateSprayPDF } from '@/lib/sprayExport';
import { useSprayForm } from '@/hooks/useSprayForm';
import { SprayWizardNav } from '@/components/spray/SprayWizardNav';
import { SprayWizardCoreStep } from '@/components/spray/SprayWizardCoreStep';
import { SprayWizardMixStep } from '@/components/spray/SprayWizardMixStep';
import { SprayWizardConditionsStep } from '@/components/spray/SprayWizardConditionsStep';
import { SprayWizardReviewStep } from '@/components/spray/SprayWizardReviewStep';

interface SprayModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: SprayRecord;
}

function SprayModal({ field, open, onClose, initialData }: SprayModalProps) {
  const { sprayRecipes, farmName, viewingSeason } = useFarm();
  const form = useSprayForm({ field, open, onClose, initialData });

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

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="bg-card border-spray/30 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center flex-wrap gap-2 text-spray font-bold">
            <div className="flex items-center gap-2">
              <CloudRain size={20} />
              <span>{initialData ? 'Edit' : 'Spray'} — {field.name}</span>
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

        <div className="py-2">
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
            seasonYear={initialData ? initialData.seasonYear : viewingSeason}
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
        </div>

        <DialogFooter className="flex flex-col gap-2 pt-2 border-t border-border/20">
          {initialData && step === 'review' && (
            <Button
              variant="outline"
              onClick={() => generateSprayPDF([initialData], farmName)}
              className="touch-target w-full border-spray/30 text-spray hover:bg-spray/10 font-bold py-6 text-base"
            >
              <FileDown size={20} className="mr-2" />
              Export PDF
            </Button>
          )}

          <div className="flex gap-2 w-full">
            {canGoBack && (
              <Button
                variant="outline"
                onClick={goBack}
                disabled={isSaving}
                className="touch-target flex-1 border-border text-foreground hover:bg-muted font-bold py-6 text-base"
              >
                <ChevronLeft size={20} className="mr-1" />
                Back
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={isSaving || (step !== 'review' && !canGoNext)}
              className={`touch-target flex-1 font-bold py-6 text-base disabled:opacity-50 disabled:grayscale ${
                isFullyCompliant || step !== 'review'
                  ? 'bg-spray text-white hover:bg-spray/90 glow-spray'
                  : 'bg-yellow-600 text-white hover:bg-yellow-500'
              }`}
            >
              {isSaving ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={24} className="animate-spin" />
                  <span>Saving...</span>
                </div>
              ) : step === 'review' ? (
                !isMinimumValid ? (
                  <span>Enter Product Name to Save</span>
                ) : !isFullyCompliant ? (
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={18} />
                    <span>{initialData ? 'Update (Incomplete)' : 'Save (Incomplete)'}</span>
                  </div>
                ) : (
                  <span>{initialData ? 'Update Spray Record' : 'Save Spray Record'}</span>
                )
              ) : (
                <div className="flex items-center gap-1">
                  <span>Next</span>
                  <ChevronRight size={18} />
                </div>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SprayModal;
