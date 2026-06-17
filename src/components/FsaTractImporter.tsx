import { useRef } from 'react';
import { FileUp } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useFarm } from '@/store/farmStore';
import { parseCluGeoJson } from '@/lib/cluImport';

interface FsaTractImporterProps {
  onImported?: () => void;
}

export default function FsaTractImporter({ onImported }: FsaTractImporterProps) {
  const { importTract } = useFarm();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    let imported = 0;
    for (const file of Array.from(files)) {
      try {
        const contents = await file.text();
        const { tractKey, collection } = parseCluGeoJson(contents, file.name);

        const ok = await importTract(tractKey, file.name, collection, collection.features.length);
        if (ok) imported++;
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : 'Failed to parse'}`);
      }
    }

    if (imported > 0) {
      toast.success(`${imported} tract${imported > 1 ? 's' : ''} imported`);
      onImported?.();
    }

    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        className="gap-2"
      >
        <FileUp size={16} />
        Import Tract JSON
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.geojson"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
    </div>
  );
}
