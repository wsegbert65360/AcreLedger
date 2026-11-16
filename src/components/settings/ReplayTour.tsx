import { useNavigate } from 'react-router-dom';

import { Compass } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { COACHMARKS_RESTART_EVENT } from '@/hooks/useCoachmarks';

export default function ReplayTour() {
  const navigate = useNavigate();

  const replay = () => {
    navigate('/');
    window.dispatchEvent(new Event(COACHMARKS_RESTART_EVENT));
  };

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground text-lg flex items-center gap-2">
          <Compass size={18} className="text-primary" />
          App Tour
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Walk through the main screens again.</p>
        <Button variant="outline" size="sm" onClick={replay}>Replay tour</Button>
      </CardContent>
    </Card>
  );
}
