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
      className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-4 flex items-center justify-between ring-1 ring-white/5 shadow-xl cursor-pointer hover:bg-card/80 transition-all active:scale-[0.98]"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <MapPin size={20} />
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
