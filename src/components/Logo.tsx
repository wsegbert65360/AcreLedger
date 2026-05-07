import { Sprout } from 'lucide-react';

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
        <Sprout size={16} className="text-primary" />
      </div>
      <span className="font-bold font-mono tracking-tighter text-foreground">
        AcreLedger
      </span>
    </div>
  );
}
