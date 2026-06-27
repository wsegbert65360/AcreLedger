import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { WeatherData } from '@/types/weather';
import { SprayDecisionMatrix } from '@/components/weather/SprayDecisionMatrix';
import { Loader2, History as HistoryIcon, AlertTriangle } from 'lucide-react';

// Wind drift warning threshold. Local copy matches SprayAuditReport.tsx and
// weatherHelpers.ts; promote to a shared constants file if a fourth site appears.
const WIND_ALERT_MPH = 10;

interface SprayWizardConditionsStepProps {
  fieldLat: number | null;
  fieldLng: number | null;
  weather: WeatherData | null;
  loading: boolean;
  isRecovering: boolean;
  manualWindDirection: string;
  manualWindSpeed: string;
  treatedAreaSize: string;
  treatedAreaUnit: string;
  totalAmountApplied: string;
  mixtureRate: string;
  totalMixtureVolume: string;
  isPremixed: boolean;
  showValidation: boolean;
  onRecoverWeather: () => void;
  setManualWindDirection: (v: string) => void;
  setManualWindSpeed: (v: string) => void;
  setTreatedAreaSize: (v: string) => void;
  setTreatedAreaUnit: (v: string) => void;
  setTotalAmountApplied: (v: string) => void;
  setMixtureRate: (v: string) => void;
  setTotalMixtureVolume: (v: string) => void;
  setIsPremixed: (v: boolean) => void;
}

export function SprayWizardConditionsStep(props: SprayWizardConditionsStepProps) {
  const [showRecover, setShowRecover] = useState(false);
  const {
    fieldLat, fieldLng, weather, loading, isRecovering,
    manualWindDirection, manualWindSpeed, treatedAreaSize, treatedAreaUnit,
    totalAmountApplied, mixtureRate, totalMixtureVolume, isPremixed, showValidation,
    onRecoverWeather, setManualWindDirection, setManualWindSpeed,
    setTreatedAreaSize, setTreatedAreaUnit, setTotalAmountApplied,
    setMixtureRate, setTotalMixtureVolume, setIsPremixed
  } = props;

  const inputError = (missing: boolean) => missing && showValidation ? 'border-destructive ring-1 ring-destructive' : '';
  const windNum = parseFloat(manualWindSpeed);
  const hasWind = !isNaN(windNum);
  const isHighWind = hasWind && windNum > WIND_ALERT_MPH;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
      <div className={`rounded-lg border p-3 space-y-3 ${weather ? 'border-spray/20 bg-muted/30' : 'border-destructive/30 bg-destructive/5'}`}>
        <div className="flex items-center justify-between">
          <span className={`font-mono text-[11px] font-bold uppercase tracking-wider ${weather ? 'text-spray' : 'text-destructive'}`}>
            Environmental Conditions *
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRecover(s => !s)}
              className="h-6 px-2 text-[10px] font-bold text-spray hover:bg-spray/10"
            >
              <HistoryIcon size={10} className="mr-1" />
              {showRecover ? 'HIDE' : 'RECOVER'}
            </Button>
            {loading && <Loader2 size={12} className="text-spray animate-spin" />}
          </div>
        </div>

        {showRecover && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRecoverWeather}
              disabled={isRecovering || !fieldLat || !fieldLng}
              className="h-7 px-2 text-[10px] font-bold border-spray/30 text-spray hover:bg-spray/10"
            >
              {isRecovering ? <Loader2 size={10} className="animate-spin mr-1" /> : <HistoryIcon size={10} className="mr-1" />}
              Pull historical weather
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="windDirection" className="text-xs font-semibold text-muted-foreground">
              Wind Direction <span className="text-destructive ml-0.5">*</span>
            </Label>
            <Select value={manualWindDirection} onValueChange={setManualWindDirection}>
              <SelectTrigger id="windDirection" className={`h-11 bg-background border-border text-sm font-mono ${inputError(!manualWindDirection.trim())}`}>
                <SelectValue placeholder="Dir" />
              </SelectTrigger>
              <SelectContent>
                {['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'CALM'].map(dir => (
                  <SelectItem key={dir} value={dir} className="font-mono text-xs">{dir}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="windSpeed" className="text-xs font-semibold text-muted-foreground text-right block">
              Wind Speed (mph) <span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input
              id="windSpeed"
              name="windSpeed"
              type="number"
              inputMode="decimal"
              value={manualWindSpeed}
              onChange={e => setManualWindSpeed(e.target.value)}
              placeholder={weather?.wind?.toString() || '0'}
              className={`h-11 bg-background border-border text-sm font-mono text-right ${inputError(!manualWindSpeed.trim())}`}
            />
          </div>
        </div>

        {isHighWind && (
          <div className="flex items-start gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-yellow-600 animate-in fade-in slide-in-from-top-2 duration-200 mt-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-xs font-mono font-bold uppercase">High Drift Risk!</div>
              <p className="text-[10px] text-yellow-700/80 leading-normal">
                Wind speed ({windNum} mph) exceeds the recommended limit of {WIND_ALERT_MPH} mph. High risk of chemical drift.
              </p>
            </div>
          </div>
        )}

        {hasWind && weather && (
          <SprayDecisionMatrix
            tempF={weather.temp}
            humidity={weather.humidity}
            windSpeed={windNum}
            windDirection={manualWindDirection || weather.windDirection}
            precipProb={weather.precipProb ?? 0}
          />
        )}

        {weather && (
          <div className="grid grid-cols-2 gap-2 border-t border-border/30 pt-2">
            <div className="space-y-0.5">
              <div className="text-[11px] font-mono text-muted-foreground uppercase">Temp (°F) *</div>
              <div className="text-xs font-mono font-bold">{weather.temp}°F</div>
            </div>
            <div className="space-y-0.5 text-right">
              <div className="text-[11px] font-mono text-muted-foreground uppercase">Humidity (%)</div>
              <div className="text-xs font-mono font-bold">{weather.humidity}%</div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Area & Volume</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="treatedArea" className="text-xs font-semibold text-muted-foreground">
              Treated Area Size <span className="text-destructive ml-0.5">*</span>
            </Label>
            <div className="flex gap-1">
              <Input
                id="treatedArea"
                type="number"
                inputMode="decimal"
                value={treatedAreaSize}
                onChange={e => setTreatedAreaSize(e.target.value)}
                placeholder="80"
                className={`mt-0.5 bg-muted border-border text-foreground h-11 flex-1 ${inputError(!treatedAreaSize.trim())}`}
              />
              <Select value={treatedAreaUnit} onValueChange={setTreatedAreaUnit}>
                <SelectTrigger className="mt-0.5 bg-muted border-border text-foreground h-11 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ac">ac</SelectItem>
                  <SelectItem value="sqft">sqft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="totalAmount" className="text-xs font-semibold text-muted-foreground">Total Material Applied</Label>
            <Input
              id="totalAmount"
              type="number"
              inputMode="decimal"
              value={totalAmountApplied}
              onChange={e => setTotalAmountApplied(e.target.value)}
              placeholder="Auto-sum"
              className="mt-0.5 bg-muted border-border text-foreground h-11 font-bold"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="mixtureRate" className="text-xs font-semibold text-muted-foreground">Mixture Rate</Label>
            <Input
              id="mixtureRate"
              value={mixtureRate}
              onChange={e => setMixtureRate(e.target.value)}
              placeholder="e.g. 15 gal/ac"
              className="mt-0.5 bg-muted border-border text-foreground h-11"
            />
          </div>
          <div>
            <Label htmlFor="totalMixtureVolume" className="text-xs font-semibold text-muted-foreground">Total Mix Volume</Label>
            <Input
              id="totalMixtureVolume"
              value={totalMixtureVolume}
              onChange={e => setTotalMixtureVolume(e.target.value)}
              placeholder="e.g. 1200 gal"
              className="mt-0.5 bg-muted border-border text-foreground h-11"
            />
          </div>
        </div>
        <div className="flex items-center space-x-2 pt-1">
          <Switch id="premixed" checked={isPremixed} onCheckedChange={setIsPremixed} />
          <Label htmlFor="premixed" className="text-xs font-semibold text-muted-foreground">Premixed</Label>
        </div>
      </div>
    </div>
  );
}
