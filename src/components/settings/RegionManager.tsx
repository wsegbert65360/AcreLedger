import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe } from 'lucide-react';
import { regionPreferences, useAppPreferences, type CountryCode } from '@/store/useAppPreferences';
import { useFarm } from '@/store/farmStore';

interface RegionManagerProps {
  /**
   * Controlled mode (onboarding): the caller holds the choice and saves it.
   * `null` shows an unselected picker so the user has to choose a country.
   * Leave both props out in Settings, where a change is saved immediately.
   */
  value?: CountryCode | null;
  onChange?: (country: CountryCode) => void;
}

/**
 * Region settings for the Australia pilot.
 * Country drives the compliance profile default (us-epa / au-apvma),
 * unit system (imperial / metric), and locale (en-US / en-AU).
 */
export default function RegionManager({ value, onChange }: RegionManagerProps = {}) {
  // Use the same per-user preference scope as the spray form (useSprayForm),
  // otherwise the country choice is written to a key the form never reads.
  const { session } = useFarm();
  const { preferences, updatePreferences } = useAppPreferences(session?.user?.id);
  const controlled = onChange !== undefined;
  // Radix Select treats '' as "no value" and shows the placeholder.
  const selected = controlled ? value ?? '' : preferences.country;

  const handleCountryChange = (country: CountryCode) => {
    if (onChange) {
      onChange(country);
      return;
    }
    // Keep locale and units in sync with the country; the user can still
    // override them individually afterwards.
    updatePreferences(regionPreferences(country));
  };

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground text-lg flex items-center gap-2">
          <Globe size={18} className="text-primary" />
          Region
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="country-select" className="text-muted-foreground font-mono text-xs uppercase">
            Country
          </Label>
          <Select value={selected} onValueChange={(v) => handleCountryChange(v as CountryCode)}>
            <SelectTrigger id="country-select" className="w-full">
              <SelectValue placeholder="Choose your country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="US">United States</SelectItem>
              <SelectItem value="AU">Australia (pilot)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Australia uses the APVMA compliance profile and metric units, and says “paddock” on the field list and field form. Other screens still say “field” during the pilot.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
