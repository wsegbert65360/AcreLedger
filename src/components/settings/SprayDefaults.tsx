import { useState, useEffect } from 'react';
import { useFarm } from '@/store/farmStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Wrench, Save, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function SprayDefaults() {
  const { session } = useFarm();
  const userPrefix = session?.user?.id?.slice(0, 8) || 'local';

  const [equipmentId, setEquipmentId] = useState(() =>
    localStorage.getItem(`al_equipment_id_${userPrefix}`) || ''
  );
  const [cropOrSiteTreated, setCropOrSiteTreated] = useState(() =>
    localStorage.getItem(`al_default_crop_${userPrefix}`) || ''
  );
  const [applicationMethod, setApplicationMethod] = useState(() =>
    localStorage.getItem(`al_default_app_method_${userPrefix}`) || 'Ground Broadcast'
  );
  const [rei, setRei] = useState(() =>
    localStorage.getItem(`al_default_rei_${userPrefix}`) || '12h'
  );
  const [targetPest, setTargetPest] = useState(() =>
    localStorage.getItem(`al_default_target_pest_${userPrefix}`) || ''
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem(`al_equipment_id_${userPrefix}`, equipmentId.trim());
    localStorage.setItem(`al_default_crop_${userPrefix}`, cropOrSiteTreated.trim());
    localStorage.setItem(`al_default_app_method_${userPrefix}`, applicationMethod);
    localStorage.setItem(`al_default_rei_${userPrefix}`, rei.trim());
    localStorage.setItem(`al_default_target_pest_${userPrefix}`, targetPest.trim());
    setSaved(true);
    toast.success('Spray defaults saved');
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card className="border-spray/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-spray text-lg">
          <Wrench size={18} />
          Spray Defaults
        </CardTitle>
        <p className="text-muted-foreground text-xs font-mono">
          Set once, auto-fills on every new spray record
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] font-mono text-muted-foreground uppercase">Equipment / Sprayer</Label>
            <Input
              value={equipmentId}
              onChange={e => setEquipmentId(e.target.value)}
              placeholder="e.g. Miller Nitro"
              className="mt-0.5 bg-muted border-border text-foreground h-9 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] font-mono text-muted-foreground uppercase">REI (Re-entry)</Label>
            <Input
              value={rei}
              onChange={e => setRei(e.target.value)}
              placeholder="e.g. 12h"
              className="mt-0.5 bg-muted border-border text-foreground h-9 text-xs"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] font-mono text-muted-foreground uppercase">Crop / Site Treated</Label>
            <Input
              value={cropOrSiteTreated}
              onChange={e => setCropOrSiteTreated(e.target.value)}
              placeholder="e.g. Corn"
              className="mt-0.5 bg-muted border-border text-foreground h-9 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] font-mono text-muted-foreground uppercase">App Method</Label>
            <Select value={applicationMethod} onValueChange={setApplicationMethod}>
              <SelectTrigger className="mt-0.5 bg-muted border-border text-foreground h-9 text-xs">
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
          <Label className="text-[10px] font-mono text-muted-foreground uppercase">Default Target Pest(s)</Label>
          <Input
            value={targetPest}
            onChange={e => setTargetPest(e.target.value)}
            placeholder="e.g. grass/broadleaves"
            className="mt-0.5 bg-muted border-border text-foreground h-9 text-xs"
          />
        </div>
        <Button
          onClick={handleSave}
          variant="outline"
          className={`w-full font-bold text-xs ${saved ? 'border-green-500/50 text-green-400' : 'border-spray/30 text-spray hover:bg-spray/10'}`}
        >
          {saved ? <Check size={16} className="mr-2" /> : <Save size={16} className="mr-2" />}
          {saved ? 'Saved!' : 'Save Defaults'}
        </Button>
      </CardContent>
    </Card>
  );
}
