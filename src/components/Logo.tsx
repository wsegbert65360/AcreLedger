import { Book, CheckCircle } from 'lucide-react';

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="relative">
        <Book size={24} className="text-primary" />
        <CheckCircle 
          size={12} 
          className="absolute -bottom-1 -right-1 text-primary bg-background rounded-full" 
          strokeWidth={3}
        />
      </div>
      <span className="font-bold font-mono tracking-tight text-foreground decoration-primary/50 decoration-2 underline-offset-4 text-[17px]">
        AcreLedger
      </span>
    </div>
  );
}
