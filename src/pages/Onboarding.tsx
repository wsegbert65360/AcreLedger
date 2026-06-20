import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map as MapIcon, Sprout, ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFarm } from '@/store/farmStore';
import TractAssignmentFlow from '@/components/TractAssignmentFlow';

export default function Onboarding() {
  const navigate = useNavigate();
  const { session, farmName, updateFarmName, completeOnboarding } = useFarm();
  const [step, setStep] = useState<'name' | 'fields'>('name');
  const [tempName, setTempName] = useState(farmName || 'My Farm');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (farmName) {
      setTempName(farmName);
    }
  }, [farmName]);

  const handleSkip = async () => {
    await completeOnboarding();
    navigate('/');
  };

  const handleDone = async () => {
    await completeOnboarding();
    navigate('/');
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName.trim()) return;

    setIsSaving(true);
    const success = await updateFarmName(tempName.trim());
    setIsSaving(false);
    if (success) {
      setStep('fields');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 border-b border-border p-4 bg-background">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              {step === 'name' ? (
                <Sprout size={20} className="text-primary" />
              ) : (
                <MapIcon size={20} className="text-foreground" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                {step === 'name' ? 'Welcome to AcreLedger' : 'Set Up Your Fields'}
              </h1>
              <p className="text-xs text-muted-foreground">
                {step === 'name'
                  ? "Let's start by naming your farming operation"
                  : 'Import FSA tract boundaries and assign them to fields'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
            Skip setup
          </Button>
        </div>
      </header>

      {/* Progress Indicators */}
      <div className="max-w-2xl w-full mx-auto px-4 pt-6 shrink-0">
        <div className="flex items-center justify-center gap-2">
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 'name' ? 'w-8 bg-primary' : 'w-3 bg-muted'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 'fields' ? 'w-8 bg-primary' : 'w-3 bg-muted'}`} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-6">
        <div className={`${step === 'name' ? 'max-w-md' : 'max-w-2xl'} mx-auto px-4`}>
          {step === 'name' ? (
            <div className="bg-card border border-border/55 rounded-2xl p-6 shadow-xl space-y-6 mt-8">
              <div className="space-y-2 text-center">
                <h2 className="text-xl font-bold tracking-tight text-foreground">Name your farm</h2>
                <p className="text-sm text-muted-foreground">
                  This name will appear on FSA reports, chemical spray logs, scale tickets, and export files.
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
                  disabled={isSaving || !tempName.trim()}
                >
                  {isSaving ? 'Saving...' : 'Continue'}
                  <ArrowRight size={18} />
                </Button>
              </form>
            </div>
          ) : (
            <TractAssignmentFlow onDone={handleDone} />
          )}
        </div>
      </div>
    </div>
  );
}
