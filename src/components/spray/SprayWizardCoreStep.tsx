import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Clock, MapPin, User, FileText } from 'lucide-react';

interface SprayWizardCoreStepProps {
  // State
  sprayDate: string;
  startTime: string;
  endTime: string;
  isEndTimeManual: boolean;
  applicatorName: string;
  licenseNumber: string;
  targetPest: string;
  cropOrSiteTreated: string;
  applicationMethod: string;
  siteAddress: string;
  involvedTechnicians: string;
  equipmentId: string;
  rei: string;
  notes: string;
  sensitiveAreaCheck: boolean;
  sensitiveAreaNotes: string;
  showValidation: boolean;

  // Setters
  setSprayDate: (v: string) => void;
  setStartTime: (v: string) => void;
  setEndTime: (v: string) => void;
  setIsEndTimeManual: (v: boolean) => void;
  setApplicatorName: (v: string) => void;
  setLicenseNumber: (v: string) => void;
  setTargetPest: (v: string) => void;
  setCropOrSiteTreated: (v: string) => void;
  setApplicationMethod: (v: string) => void;
  setSiteAddress: (v: string) => void;
  setInvolvedTechnicians: (v: string) => void;
  setEquipmentId: (v: string) => void;
  setRei: (v: string) => void;
  setNotes: (v: string) => void;
  setSensitiveAreaCheck: (v: boolean) => void;
  setSensitiveAreaNotes: (v: string) => void;
}

export function SprayWizardCoreStep(props: SprayWizardCoreStepProps) {
  const {
    sprayDate, startTime, endTime, isEndTimeManual,
    applicatorName, licenseNumber, targetPest,
    cropOrSiteTreated, applicationMethod, siteAddress,
    involvedTechnicians, equipmentId, rei, notes,
    sensitiveAreaCheck, sensitiveAreaNotes, showValidation,
    setSprayDate, setStartTime, setEndTime, setIsEndTimeManual,
    setApplicatorName, setLicenseNumber, setTargetPest,
    setCropOrSiteTreated, setApplicationMethod, setSiteAddress,
    setInvolvedTechnicians, setEquipmentId, setRei, setNotes,
    setSensitiveAreaCheck, setSensitiveAreaNotes
  } = props;

  const inputError = (missing: boolean) => missing && showValidation ? 'border-destructive ring-1 ring-destructive' : '';

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
          <Clock size={12} /> timing
        </div>
        <div>
          <Label htmlFor="sprayDate" className="text-muted-foreground font-mono text-xs font-bold">APPLICATION DATE *</Label>
          <Input
            id="sprayDate"
            name="sprayDate"
            type="date"
            value={sprayDate}
            onChange={e => setSprayDate(e.target.value)}
            className={`mt-1 bg-muted border-border text-foreground ${inputError(!sprayDate)}`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="startTime" className="text-[11px] font-mono text-muted-foreground uppercase">Start Time *</Label>
            <Input
              id="startTime"
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className={`mt-0.5 bg-muted border-border text-foreground h-11 ${inputError(!startTime.trim())}`}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="endTime" className="text-[11px] font-mono text-muted-foreground uppercase">End Time *</Label>
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-mono text-muted-foreground">MANUAL</span>
                <Switch
                  id="endTimeManual"
                  checked={isEndTimeManual}
                  onCheckedChange={setIsEndTimeManual}
                  className="scale-75 h-4 w-7"
                />
              </div>
            </div>
            <Input
              id="endTime"
              type="time"
              value={endTime}
              onChange={e => { setEndTime(e.target.value); setIsEndTimeManual(true); }}
              className={`mt-0.5 bg-muted border-border text-foreground h-11 ${inputError(!endTime.trim())}`}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
          <User size={12} /> applicators & safety
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="applicator" className="text-[11px] font-mono text-muted-foreground uppercase">Cert. Applicator *</Label>
            <Input
              id="applicator"
              value={applicatorName}
              onChange={e => setApplicatorName(e.target.value)}
              className={`mt-0.5 bg-muted border-border text-foreground h-11 ${inputError(!applicatorName.trim())}`}
            />
          </div>
          <div>
            <Label htmlFor="license" className="text-[11px] font-mono text-muted-foreground uppercase">License # *</Label>
            <Input
              id="license"
              value={licenseNumber}
              onChange={e => setLicenseNumber(e.target.value)}
              className={`mt-0.5 bg-muted border-border text-foreground h-11 ${inputError(!licenseNumber.trim())}`}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="equipmentId" className="text-[11px] font-mono text-muted-foreground uppercase">Equipment ID *</Label>
            <Input
              id="equipmentId"
              value={equipmentId}
              onChange={e => setEquipmentId(e.target.value)}
              placeholder="e.g. Miller Nitro"
              className={`mt-0.5 bg-muted border-border text-foreground h-11 ${inputError(!equipmentId.trim())}`}
            />
          </div>
          <div>
            <Label htmlFor="rei" className="text-[11px] font-mono text-muted-foreground uppercase">REI (Re-entry)</Label>
            <Input
              id="rei"
              value={rei}
              onChange={e => setRei(e.target.value)}
              placeholder="e.g. 12h"
              className="mt-0.5 bg-muted border-border text-foreground h-11"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="technicians" className="text-[11px] font-mono text-muted-foreground uppercase">Involved Technicians / Helpers (Optional)</Label>
          <Input
            id="technicians"
            value={involvedTechnicians}
            onChange={e => setInvolvedTechnicians(e.target.value)}
            placeholder="e.g. John Doe, Mike Smith"
            className="mt-0.5 bg-muted border-border text-foreground h-11"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
          <MapPin size={12} /> site & crop
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="col-span-1">
            <Label htmlFor="cropTreated" className="text-[11px] font-mono text-muted-foreground uppercase">Crop / Site Treated *</Label>
            <Input
              id="cropTreated"
              value={cropOrSiteTreated}
              onChange={e => setCropOrSiteTreated(e.target.value)}
              placeholder="e.g. Corn"
              className={`mt-0.5 bg-muted border-border text-foreground h-11 ${inputError(!cropOrSiteTreated.trim())}`}
            />
          </div>
          <div>
            <Label htmlFor="appMethod" className="text-[11px] font-mono text-muted-foreground uppercase">App Method *</Label>
            <Select value={applicationMethod} onValueChange={setApplicationMethod}>
              <SelectTrigger className={`mt-0.5 bg-muted border-border text-foreground h-11 text-sm ${inputError(!applicationMethod.trim())}`}>
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
          <Label htmlFor="siteAddress" className="text-[11px] font-mono text-muted-foreground uppercase">Site Description / Address</Label>
          <Input
            id="siteAddress"
            value={siteAddress}
            onChange={e => setSiteAddress(e.target.value)}
            placeholder="Field name or location"
            className="mt-0.5 bg-muted border-border text-foreground h-11"
          />
        </div>
        <div>
          <Label htmlFor="targetPest" className="text-[11px] font-mono text-muted-foreground uppercase">Target Pest(s) *</Label>
          <Input
            id="targetPest"
            value={targetPest}
            onChange={e => setTargetPest(e.target.value)}
            placeholder="e.g. Pigweed"
            className={`mt-0.5 bg-muted border-border text-foreground h-11 ${inputError(!targetPest.trim())}`}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
          <FileText size={12} /> compliance notes
        </div>
        <div className="flex items-start space-x-2 bg-spray/5 p-2.5 rounded-lg border border-spray/10">
          <Checkbox
            id="sensitiveAreaCheck"
            checked={sensitiveAreaCheck}
            onCheckedChange={(checked) => setSensitiveAreaCheck(!!checked)}
            className="mt-0.5 border-spray/50 data-[state=checked]:bg-spray data-[state=checked]:border-spray"
          />
          <div className="grid gap-1.5 leading-none">
            <Label htmlFor="sensitiveAreaCheck" className="text-[11px] font-bold text-spray uppercase leading-tight cursor-pointer">
              Sensitive Area Check Performed
            </Label>
            <p className="text-[10px] text-muted-foreground leading-tight">
              Verified nearby sensitive crops/bees via DriftWatch or visual check.
            </p>
          </div>
        </div>
        {sensitiveAreaCheck && (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <Label htmlFor="sensitiveAreaNotes" className="text-[11px] font-mono text-muted-foreground uppercase text-spray">Sensitive Area Notes</Label>
            <Input
              id="sensitiveAreaNotes"
              value={sensitiveAreaNotes}
              onChange={e => setSensitiveAreaNotes(e.target.value)}
              placeholder="e.g. Neighboring vineyard verified clear"
              className="mt-0.5 bg-muted border-spray/20 text-foreground h-11 focus-visible:ring-spray"
            />
          </div>
        )}
        <div>
          <Label htmlFor="notes" className="text-[11px] font-mono text-muted-foreground uppercase">Notes / Additional Info</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add any extra compliance or field notes here..."
            className="mt-0.5 bg-muted border-border text-foreground text-sm resize-none"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}
