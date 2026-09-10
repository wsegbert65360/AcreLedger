import { useRef } from 'react';
import { FileUp } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useFarm } from '@/store/farmStore';
import { parseCluFile } from '@/lib/cluImport';

interface FsaTractImporterProps {
  onImported?: () => void;
}

export default function FsaTractImporter({ onImported }: FsaTractImporterProps) {
  const { importTract } = useFarm();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    let importedTracts = 0;
    let importedClus = 0;
    for (const file of Array.from(files)) {
      try {
        const tracts = await parseCluFile(file);
        for (const tract of tracts) {
          const ok = await importTract(tract.tractKey, file.name, tract.collection, tract.collection.features.length);
          if (ok) {
            importedTracts++;
            importedClus += tract.collection.features.length;
          }
        }
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : 'Failed to parse'}`);
      }
    }

    if (importedTracts > 0) {
      toast.success(`Imported ${importedTracts} tract${importedTracts > 1 ? 's' : ''} with ${importedClus} CLU${importedClus !== 1 ? 's' : ''}`);
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
        Load Boundary File
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.json,.geojson"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
    </div>
  );
}
