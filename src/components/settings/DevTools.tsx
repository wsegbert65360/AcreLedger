import { useState } from 'react';
import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { seedDatabase } from '@/test/seedDatabase';

export default function DevTools() {
  const store = useFarm();
  const [seeding, setSeeding] = useState(false);
  const [progress, setProgress] = useState('');

  const handleSeed = async () => {
    setSeeding(true);
    setProgress('Starting...');
    try {
      const result = await seedDatabase(store, 100, (current, total, label) => {
        setProgress(`${label}: ${current}/${total}`);
      });
      if (result.errors.length > 0) {
        toast.warning(`Seeded ${result.totalCreated} items with ${result.errors.length} errors`);
        console.warn('Seed errors:', result.errors);
      } else {
        toast.success(`Seeded ${result.totalCreated} items successfully!`);
      }
    } catch (err) {
      console.error('Seed failed:', err);
      toast.error('Seeding failed — check console');
    } finally {
      setSeeding(false);
      setProgress('');
    }
  };

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="text-sm font-mono flex items-center gap-2 text-amber-500">
          <FlaskConical className="w-4 h-4" />
          Developer Tools
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Stress-test the app by seeding 100 of every entity type (fields, bins, plantings, sprays, harvests, hay, fertilizer, grain, seeds, recipes).
        </p>
        <Button
          variant="outline"
          onClick={handleSeed}
          disabled={seeding}
          className="w-full border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
        >
          <FlaskConical className="w-4 h-4 mr-2" />
          {seeding ? progress || 'Seeding...' : 'Seed 100 of Everything'}
        </Button>
      </CardContent>
    </Card>
  );
}
