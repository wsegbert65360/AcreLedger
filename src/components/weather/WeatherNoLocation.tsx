import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';

export default function WeatherNoLocation({ compact = false, description = 'Enter a zip code or coordinates in the search bar above, allow location access, or add field coordinates.', children }: { compact?: boolean; description?: string; children?: ReactNode }) {
  return (
    <div className={`text-center ${compact ? 'py-4' : 'py-16'} px-4 border-2 border-dashed border-border rounded-2xl bg-muted/20`}>
      <MapPin size={compact ? 24 : 40} className="mx-auto text-muted-foreground/20 mb-3" />
      <h3 className="text-sm font-bold text-foreground mb-1">No Location</h3>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-[260px] mx-auto">{description}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
