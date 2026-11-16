import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { Map as MapIcon, Sprout, ArrowRight, Globe, WifiOff } from 'lucide-react';

import TractAssignmentFlow from '@/components/TractAssignmentFlow';
import RegionManager from '@/components/settings/RegionManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { useEntitlement } from '@/hooks/useEntitlement';
import { isAuPilotEnabled } from '@/lib/auPilot';
import { isFreeTierLocked } from '@/lib/entitlements';
import { useFarm } from '@/store/farmStore';
import { useAppPreferences } from '@/store/useAppPreferences';

type SetupStep = 'name' | 'fields' | 'region';

export default function Onboarding() {
  const navigate = useNavigate();
  const { farmName, updateFarmName, completeOnboarding, isOnline, session } = useFarm();
  const { entitlement } = useEntitlement();
  const { preferences } = useAppPreferences(session?.user?.id);
  // Same rule as the Settings Region card: AU-pilot users set their region instead of FSA tracts.
  const auPilot = isAuPilotEnabled({ email: session?.user?.email, id: session?.user?.id })
    || preferences.country === 'AU';
  const secondStep: SetupStep = auPilot ? 'region' : 'fields';
  const offline = isOnline === false;

  const [step, setStep] = useState<SetupStep>('name');
  const [tempName, setTempName] = useState(farmName || 'My Farm');
  const [isSaving, setIsSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (farmName) {
      setTempName(farmName);
    }
  }, [farmName]);

  const finish = async (saveTypedName: boolean) => {
    if (inFlight.current || offline) return;
    inFlight.current = true;
    setIsSaving(true);
    try {
      // Skipping from the name step keeps a name the user already typed.
      const typed = tempName.trim();
      if (saveTypedName && typed && typed !== (farmName ?? '').trim()) {
        if (!await updateFarmName(typed)) return;
      }
      if (await completeOnboarding()) navigate('/');
    } catch (err) {
      console.error('Setup could not be completed:', err);
    } finally {
      inFlight.current = false;
      setIsSaving(false);
    }
  };

  const handleDone = () => finish(false);
  const handleSkip = () => finish(step === 'name');

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName.trim() || inFlight.current || offline) return;

    inFlight.current = true;
    setIsSaving(true);
    try {
      if (await updateFarmName(tempName.trim())) setStep(secondStep);
    } finally {
      inFlight.current = false;
      setIsSaving(false);
    }
  };

  const title = step === 'name'
    ? 'Welcome to AcreLedger'
    : step === 'region' ? 'Choose Your Region' : 'Set Up Your Fields';
  const subtitle = step === 'name'
    ? "Let's start by naming your farming operation"
    : step === 'region'
      ? 'Sets your units, wording and spray-record rules'
      : 'Import FSA tract boundaries, or add fields by hand';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 border-b border-border p-4 bg-background">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              {step === 'name' ? (
                <Sprout size={20} className="text-primary" />
              ) : step === 'region' ? (
                <Globe size={20} className="text-foreground" />
              ) : (
                <MapIcon size={20} className="text-foreground" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">{title}</h1>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={isSaving || offline} className="h-11 text-muted-foreground">
            Skip setup
          </Button>
        </div>
      </header>

      {offline && (
        <div role="status" className="max-w-2xl w-full mx-auto px-4 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <WifiOff size={16} className="shrink-0" />
            Internet required to finish setup. Connect and try again.
          </div>
        </div>
      )}

      {/* Progress Indicators */}
      <div className="max-w-2xl w-full mx-auto px-4 pt-6 shrink-0" aria-hidden="true">
        <div className="flex items-center justify-center gap-2">
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 'name' ? 'w-8 bg-primary' : 'w-3 bg-muted'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step !== 'name' ? 'w-8 bg-primary' : 'w-3 bg-muted'}`} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-6">
        <div className={`${step === 'name' ? 'max-w-md' : 'max-w-2xl'} mx-auto px-4`}>
          {step === 'name' && (
            <div className="bg-card border border-border/55 rounded-2xl p-6 shadow-xl space-y-6 mt-8">
              <div className="space-y-2 text-center">
                <h2 className="text-xl font-bold tracking-tight text-foreground">Name your farm</h2>
                <p className="text-sm text-muted-foreground">
                  This name appears on FSA reports, spray logs and exported reports.
                </p>
              </div>

              <form onSubmit={handleSaveName} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="farmNameInput" className="text-sm font-medium">Farm Name</label>
                  <Input
                    id="farmNameInput"
                    name="farmName"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    placeholder="e.g. Oak Creek Farms"
                    maxLength={100}
                    required
                    className="h-11 bg-background"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-base font-medium flex items-center justify-center gap-2"
                  disabled={isSaving || offline || !tempName.trim()}
                >
                  {isSaving ? 'Saving...' : 'Continue'}
                  <ArrowRight size={18} />
                </Button>
              </form>
            </div>
          )}

          {step === 'region' && (
            <div className="space-y-4 mt-4">
              <RegionManager />
              <Button onClick={handleDone} disabled={isSaving || offline} className="w-full h-11 gap-2">
                Done
                <ArrowRight size={18} />
              </Button>
            </div>
          )}

          {step === 'fields' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">No FSA boundary files?</p>
                  <p className="text-xs text-muted-foreground">
                    {isFreeTierLocked(entitlement)
                      ? ENTITLEMENT_COPY.onboardingFsaProNote
                      : 'You can add fields by hand on the Fields screen and import FSA tracts later in Settings.'}
                  </p>
                </div>
                <Button variant="outline" onClick={handleDone} disabled={isSaving || offline} className="h-11 shrink-0">
                  Add fields by hand instead
                </Button>
              </div>
              <TractAssignmentFlow onDone={handleDone} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
