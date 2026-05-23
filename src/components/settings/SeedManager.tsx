import { useState } from 'react';
import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sprout, Plus, Trash2 } from 'lucide-react';

export default function SeedManager() {
  const { savedSeeds, addSeed, deleteSeed } = useFarm();
  const [newSeed, setNewSeed] = useState('');

  const handleAdd = async () => {
    if (!newSeed.trim()) return;
    await addSeed(newSeed.trim());
    setNewSeed('');
  };

  return (
    <Card className="border-plant/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-plant text-lg">
          <Sprout size={18} />
          Seed Varieties
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="seedVariety" className="sr-only">New Seed Variety</Label>
        <div className="flex gap-2">
          <Input
            id="seedVariety"
            name="seedVariety"
            value={newSeed}
            onChange={e => setNewSeed(e.target.value)}
            placeholder="e.g. DKC 64-35"
            className="bg-muted border-border text-foreground"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={!newSeed.trim()} size="sm" className="bg-plant text-plant-foreground hover:bg-plant/90">
            <Plus size={16} />
          </Button>
        </div>
        {savedSeeds.length === 0 && (
          <p className="text-muted-foreground text-sm">No seeds saved yet. Add varieties above.</p>
        )}
        <div className="space-y-1">
          {savedSeeds.map(seed => (
            <div key={seed.id} className="flex items-center justify-between px-3 py-2 bg-muted rounded-lg">
              <span className="text-foreground font-mono text-sm">{seed.name}</span>
              <button onClick={async () => { await deleteSeed(seed.id); }} className="text-destructive hover:text-destructive/80">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
