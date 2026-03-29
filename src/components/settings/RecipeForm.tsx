import { useState } from 'react';
import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getUnitLabel } from '@/utils/unitConversion';
import type { SprayRecipeProduct } from '@/types/farm';

export default function RecipeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { name: string; products: SprayRecipeProduct[]; applicatorName?: string; licenseNumber?: string; epaRegNumber?: string; targetPest?: string };
  onSave: (r: { name: string; products: SprayRecipeProduct[]; applicatorName?: string; licenseNumber?: string; epaRegNumber?: string; targetPest?: string }) => void;
  onCancel: () => void;
}) {
  const { session } = useFarm();
  const userPrefix = session?.user?.id?.slice(0, 8) || "local";
  const [name, setName] = useState(initial?.name ?? '');
  const [products, setProducts] = useState<SprayRecipeProduct[]>(
    initial?.products?.length
      ? initial.products.map(p => ({ ...p, id: p.id ?? crypto.randomUUID() }))
      : [{ id: crypto.randomUUID(), product: '', rate: '', rateUnit: 'oz/ac' }]
  );
  const [applicatorName, setApplicatorName] = useState(initial?.applicatorName ?? localStorage.getItem(`al_applicator_name_${userPrefix}`) ?? '');
  const [licenseNumber, setLicenseNumber] = useState(initial?.licenseNumber ?? localStorage.getItem(`al_license_number_${userPrefix}`) ?? '');
  const [epaRegNumber, setEpaRegNumber] = useState(initial?.epaRegNumber ?? '');
  const [targetPest, setTargetPest] = useState(initial?.targetPest ?? '');

  const updateProduct = (i: number, field: keyof SprayRecipeProduct, value: string) => {
    setProducts(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };

  const addProduct = () => {
    setProducts(prev => [...prev, { id: crypto.randomUUID(), product: '', rate: '', rateUnit: 'oz/ac' }]);
  };

  const removeProduct = (i: number) => {
    setProducts(prev => prev.filter((_, idx) => idx !== i));
  };

  const valid = name.trim() && products.some(p => p.product.trim());

  return (
    <div className="border border-spray/30 rounded-lg p-3 space-y-3 bg-spray/5">
      <div>
        <Label htmlFor="recipeName" className="text-muted-foreground font-mono text-xs">RECIPE NAME *</Label>
        <Input
          id="recipeName"
          name="recipeName"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Burndown Mix"
          className="mt-1 bg-muted border-border text-foreground"
          autoFocus
        />
      </div>
      <Label className="text-muted-foreground font-mono text-xs">PRODUCTS</Label>
      {products.map((p, i) => (
        <div key={p.id} className="flex gap-2 items-start border-b border-border/30 pb-3 last:border-0 last:pb-0">
          <div className="flex-1 space-y-2">
            <Input
              id={`product-${i}`}
              name={`product-${i}`}
              value={p.product}
              onChange={e => updateProduct(i, 'product', e.target.value)}
              placeholder="Product name (e.g. Roundup)"
              className="bg-muted border-border text-foreground text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <Label htmlFor={`rate-${i}`} className="text-[10px] font-mono text-muted-foreground uppercase">Rate / Ac</Label>
                <div className="flex gap-1.5 mt-0.5">
                  <Input
                    id={`rate-${i}`}
                    name={`rate-${i}`}
                    value={p.rate}
                    onChange={e => updateProduct(i, 'rate', e.target.value)}
                    placeholder="22"
                    className="bg-muted border-border text-foreground text-xs h-9 px-2 w-20"
                  />
                  <Select 
                    value={p.rateUnit} 
                    onValueChange={(val) => updateProduct(i, 'rateUnit', val)}
                  >
                    <SelectTrigger className="bg-muted border-border text-foreground text-xs h-9 px-2 flex-1">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fl oz/ac">fl oz/ac</SelectItem>
                      <SelectItem value="pt/ac">pt/ac</SelectItem>
                      <SelectItem value="qt/ac">qt/ac</SelectItem>
                      <SelectItem value="gal/ac">gal/ac</SelectItem>
                      <SelectItem value="oz/ac">oz/ac</SelectItem>
                      <SelectItem value="lb/ac">lb/ac</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="col-span-1">
                <Label htmlFor={`epa-${i}`} className="text-[10px] font-mono text-muted-foreground uppercase">EPA Reg #</Label>
                <Input
                  id={`epa-${i}`}
                  name={`epa-${i}`}
                  value={p.epaRegNumber}
                  onChange={e => updateProduct(i, 'epaRegNumber', e.target.value)}
                  placeholder="e.g. 524-549"
                  className="mt-0.5 bg-muted border-border text-foreground text-xs h-9 px-2 w-full"
                />
              </div>
            </div>
            <div>
              <Label htmlFor={`active-${i}`} className="text-[10px] font-mono text-muted-foreground uppercase">Active Ingredients</Label>
              <Input
                id={`active-${i}`}
                name={`active-${i}`}
                value={p.activeIngredients || ''}
                onChange={e => updateProduct(i, 'activeIngredients', e.target.value)}
                placeholder="e.g. Glyphosate 41%"
                className="mt-0.5 bg-muted border-border text-foreground text-xs h-9 px-2 w-full"
              />
            </div>
          </div>
          {products.length > 1 && (
            <button onClick={() => removeProduct(i)} className="text-destructive hover:text-destructive/80 mt-1">
              <X size={16} />
            </button>
          )}
        </div>
      ))}
      <Button onClick={addProduct} variant="ghost" size="sm" className="text-spray text-xs w-full border border-dashed border-spray/30">
        <Plus size={14} className="mr-1" /> Add Herbicide to Mix
      </Button>
      <div className="border-t border-border/50 pt-3 space-y-2">
        <h4 className="text-muted-foreground font-mono text-xs font-bold">DEFAULT AUDIT INFO</h4>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="applicator" className="text-muted-foreground font-mono text-[10px]">APPLICATOR</Label>
            <Input
              id="applicator"
              name="applicator"
              value={applicatorName}
              onChange={e => setApplicatorName(e.target.value)}
              placeholder="Name"
              className="mt-0.5 bg-muted border-border text-foreground text-sm"
            />
          </div>
          <div>
            <Label htmlFor="license" className="text-muted-foreground font-mono text-[10px]">LICENSE #</Label>
            <Input
              id="license"
              name="license"
              value={licenseNumber}
              onChange={e => setLicenseNumber(e.target.value)}
              placeholder="e.g. IA-12345"
              className="mt-0.5 bg-muted border-border text-foreground text-sm"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="target" className="text-muted-foreground font-mono text-[10px]">GENERAL TARGET PEST</Label>
          <Input
            id="target"
            name="target"
            value={targetPest}
            onChange={e => setTargetPest(e.target.value)}
            placeholder="e.g. Broadleaf weeds"
            className="mt-0.5 bg-muted border-border text-foreground text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onSave({
          name: name.trim(),
          products: products.filter(p => p.product.trim()),
          applicatorName: applicatorName.trim() || undefined,
          licenseNumber: licenseNumber.trim() || undefined,
          epaRegNumber: epaRegNumber.trim() || undefined,
          targetPest: targetPest.trim() || undefined,
        })} disabled={!valid} size="sm" className="bg-spray text-spray-foreground hover:bg-spray/90">
          Save
        </Button>
        <Button onClick={onCancel} variant="ghost" size="sm">Cancel</Button>
      </div>
    </div>
  );
}
