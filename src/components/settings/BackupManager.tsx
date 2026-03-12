import { useState } from 'react';
import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportDataAsJson, createBackupData } from '@/utils/backup';

export default function BackupManager() {
  const store = useFarm();
  const [backingUp, setBackingUp] = useState(false);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const backupData = createBackupData(store);
      const filename = `acreledger-backup-${new Date().toISOString().split('T')[0]}.json`;
      exportDataAsJson(backupData, filename);
      toast.success('Backup created successfully!');
    } catch (error) {
      console.error('Backup error:', error);
      toast.error('Failed to create backup');
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground text-lg flex items-center gap-2">
          <Database size={18} className="text-primary" />
          Backup Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground font-mono">
          Download a JSON file containing all your farm records.
        </p>
        <Button
          onClick={handleBackup}
          disabled={backingUp}
          variant="outline"
          className="w-full"
        >
          {backingUp ? (
            'Creating Backup...'
          ) : (
            <>
              <Download size={16} className="mr-2" />
              Download Backup JSON
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
