import { useNavigate } from 'react-router-dom';
import { Map } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useFarm } from '@/store/farmStore';
import TractAssignmentFlow from '@/components/TractAssignmentFlow';

export default function Onboarding() {
  const navigate = useNavigate();
  const { session } = useFarm();
  const onboardingKey = session ? `${session.user.id}_al_onboarding_complete` : null;

  const handleSkip = () => {
    if (onboardingKey) localStorage.setItem(onboardingKey, '1');
    navigate('/');
  };

  const handleDone = () => {
    if (onboardingKey) localStorage.setItem(onboardingKey, '1');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 border-b border-border p-4 bg-background">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Map size={20} className="text-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Set Up Your Fields</h1>
              <p className="text-xs text-muted-foreground">Import FSA tract boundaries and assign them to fields</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
            Skip for now
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <div className="max-w-2xl mx-auto h-full">
          <TractAssignmentFlow onDone={handleDone} />
        </div>
      </div>
    </div>
  );
}
