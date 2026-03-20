import { useNavigate } from 'react-router-dom';
import { Field } from '@/types/farm';
import { MapPin, ChevronRight } from 'lucide-react';

interface FieldCardProps {
  field: Field;
}

export default function FieldCard({ field }: FieldCardProps) {
  const navigate = useNavigate();

  return (
    <div 
      onClick={() => navigate(`/field/${field.id}`)}
      className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-2 px-3 flex items-center justify-between ring-1 ring-white/5 shadow-xl cursor-pointer hover:bg-card/80 transition-all active:scale-[0.98]"
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <MapPin size={12} />
        </div>
        <div>
          <h3 className="font-bold text-foreground">{field.name}</h3>
          <div className="flex items-center gap-1 text-muted-foreground font-mono text-xs mt-0.5">
            {field.acreage} ac
          </div>
        </div>
      </div>
      <ChevronRight size={20} className="text-muted-foreground/50" />
    </div>
  );
}
