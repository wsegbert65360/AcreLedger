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
            placeholder="Zip code or lat,lng"
            inputMode="text"
            autoComplete="postal-code"
            id={inputId} name={inputId} value={value}
            onChange={e => onChange(e.target.value)}
            className="h-11 w-full bg-muted/30 border border-border rounded-lg pl-9 pr-3 text-base font-mono placeholder:text-muted-foreground/60 text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="h-11 px-4 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-sm transition-colors shrink-0 disabled:opacity-50"
        >
          Search
        </button>
        {onUseGps && (
          <button
            type="button"
            onClick={onUseGps}
            disabled={disabled}
            title="Use current location"
            aria-label="Use current location"
            className="h-11 w-11 border border-border hover:bg-muted/40 text-muted-foreground rounded-lg flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
          >
            <Crosshair size={18} className={usingGps ? 'animate-pulse text-primary' : ''} />
          </button>
        )}
      </div>
      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
