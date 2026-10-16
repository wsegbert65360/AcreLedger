import { Crosshair, Search } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (location: string) => void;
  error?: string;
  disabled?: boolean;
  onUseGps?: () => void;
  usingGps?: boolean;
  inputId: string;
}

export default function WeatherLocationSearch({ value, onChange, onSubmit, error, disabled, onUseGps, usingGps, inputId }: Props) {
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(value); }} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <label htmlFor={inputId} className="sr-only">Zip code or coordinates</label>
          <input
            type="text"
            placeholder="Enter zip code (e.g. 72301) or lat,lng..."
            id={inputId} name={inputId} value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full bg-muted/30 border border-border rounded-xl pl-9 pr-4 py-2 text-xs font-mono placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-xl text-xs transition-colors shrink-0 disabled:opacity-50"
        >
          Search
        </button>
        {onUseGps && (
          <button
            type="button"
            onClick={onUseGps}
            disabled={disabled}
            title="Use Current Location"
            aria-label="Use Current Location"
            className="p-2 border border-border hover:bg-muted/40 text-muted-foreground rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
          >
            <Crosshair size={16} className={usingGps ? 'animate-pulse text-primary' : ''} />
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs font-semibold text-destructive mt-0.5 ml-1 uppercase tracking-wider">
          {error}
        </p>
      )}
    </form>
  );
}
