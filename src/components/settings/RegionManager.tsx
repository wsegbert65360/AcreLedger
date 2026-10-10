import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe } from 'lucide-react';
import { useAppPreferences, type CountryCode } from '@/store/useAppPreferences';
import { useFarm } from '@/store/farmStore';

/**
 * Region settings for the Australia pilot.
 * Country drives the compliance profile default (us-epa / au-apvma),
 * unit system (imperial / metric), and locale (en-US / en-AU).
 */
export default function RegionManager() {
  // Use the same per-user preference scope as the spray form (useSprayForm),
  // otherwise the country choice is written to a key the form never reads.
  const { session } = useFarm();
  const { preferences, updatePreferences } = useAppPreferences(session?.user?.id);

  const handleCountryChange = (country: CountryCode) => {
    // Keep locale and units in sync with the country; the user can still
    // override them individually afterwards.
    if (country === 'AU') {
      updatePreferences({ country, locale: 'en-AU', unitSystem: 'metric' });
    } else {
      updatePreferences({ country, locale: 'en-US', unitSystem: 'imperial' });
    }
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
          <Select value={preferences.country} onValueChange={handleCountryChange}>
            <SelectTrigger id="country-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="US">United States</SelectItem>
              <SelectItem value="AU">Australia (pilot)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Australia uses the APVMA compliance profile, metric units, and paddock terminology.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
