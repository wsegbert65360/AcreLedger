import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SprayRecipe, SprayRecipeProduct } from '@/types/farm';
import { Plus, X } from 'lucide-react';

interface SprayWizardMixStepProps {
  sprayRecipes: SprayRecipe[];
  selectedRecipeId: string;
  products: SprayRecipeProduct[];
  showValidation: boolean;
  onRecipeSelect: (recipeId: string) => void;
  updateProduct: (i: number, field: keyof SprayRecipeProduct, value: string) => void;
  addProduct: () => void;
  removeProduct: (i: number) => void;
}

export function SprayWizardMixStep({
  sprayRecipes,
  selectedRecipeId,
  products,
  showValidation,
  onRecipeSelect,
  updateProduct,
  addProduct,
  removeProduct
}: SprayWizardMixStepProps) {
  const [indexToDelete, setIndexToDelete] = useState<number | null>(null);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
      {sprayRecipes.length > 0 && (
        <div>
          <Label htmlFor="recipeSelect" className="text-muted-foreground font-mono text-xs">SELECT RECIPE</Label>
          <Select value={selectedRecipeId} onValueChange={onRecipeSelect}>
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground">
              <SelectValue placeholder="Recipe (optional)" />
            </SelectTrigger>
            <SelectContent>
              {sprayRecipes.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground font-mono text-xs font-bold uppercase tracking-wider block">Herbicide Mix (Granular Audit) *</span>
          <div className="text-[11px] font-mono text-muted-foreground">EPA REG # REQUIRED PER ITEM</div>
        </div>

        {products.map((p, i) => (
          <div key={p.ui_id || i} className="bg-muted p-2.5 rounded-lg border border-border/50 relative">
            {products.length > 1 && (
              <button
                type="button"
                onClick={() => setIndexToDelete(i)}
                className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 shadow-md hover:bg-destructive/80 transition-colors"
                aria-label={`Remove ${p.product || 'product'} from spray mix`}
              >
                <X size={12} />
              </button>
            )}
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="col-span-1">
                  <Label htmlFor={`productName-${i}`} className="text-[11px] font-mono text-muted-foreground uppercase">Trade Name *</Label>
                  <Input
                    id={`productName-${i}`}
                    value={p.product}
                    onChange={e => updateProduct(i, 'product', e.target.value)}
                    placeholder="e.g. Roundup"
                    className={`mt-0.5 bg-background border-border text-foreground h-11 ${showValidation && !p.product.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`}
                  />
                </div>
                <div className="col-span-1">
                  <Label htmlFor={`epaReg-${i}`} className="text-[11px] font-mono text-muted-foreground uppercase">EPA Reg #</Label>
                  <Input
                    id={`epaReg-${i}`}
                    value={p.epaRegNumber}
                    onChange={e => updateProduct(i, 'epaRegNumber', e.target.value)}
                    placeholder="e.g. 524-549"
                    className={`mt-0.5 bg-background border-border text-foreground h-11 ${showValidation && !p.epaRegNumber?.trim() ? 'border-yellow-500/50' : ''}`}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor={`activeIngredients-${i}`} className="text-[11px] font-mono text-muted-foreground uppercase">Active Ingredients</Label>
                <Input
                  id={`activeIngredients-${i}`}
                  value={p.activeIngredients || ''}
                  onChange={e => updateProduct(i, 'activeIngredients', e.target.value)}
                  placeholder="e.g. Glyphosate 41%"
                  className="mt-0.5 bg-background border-border text-foreground h-11"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`appRate-${i}`} className="text-[11px] font-mono text-muted-foreground uppercase">Rate / Ac *</Label>
                  <div className="flex gap-1.5 mt-0.5">
                    <Input
                      id={`appRate-${i}`}
                      value={p.rate}
                      onChange={e => updateProduct(i, 'rate', e.target.value)}
                      placeholder="22"
                      className="bg-background border-border text-foreground h-11 px-2 w-20"
                    />
                    <Select value={p.rateUnit} onValueChange={(val) => updateProduct(i, 'rateUnit', val)}>
                      <SelectTrigger className="bg-background border-border text-foreground h-11 px-2 flex-1">
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {['fl oz/ac', 'pt/ac', 'qt/ac', 'gal/ac', 'oz/ac', 'lb/ac'].map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor={`totalProduct-${i}`} className="text-[11px] font-mono text-muted-foreground uppercase">Total Product Amt</Label>
                  <div className="flex gap-1.5 mt-0.5">
                    <Input
                      id={`totalProduct-${i}`}
                      value={p.totalProductAmount || ''}
                      onChange={e => updateProduct(i, 'totalProductAmount', e.target.value)}
                      placeholder="15"
                      className="bg-background border-border text-foreground h-11 px-2 w-20"
                    />
                    <Select value={p.totalProductUnit || 'gal'} onValueChange={(val) => updateProduct(i, 'totalProductUnit', val)}>
                      <SelectTrigger className="bg-background border-border text-foreground h-11 px-2 flex-1">
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {['gal', 'qt', 'pt', 'fl oz', 'lb', 'oz'].map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        <Button onClick={addProduct} variant="outline" size="lg" className="w-full border-dashed border-spray/30 text-spray text-xs h-11 font-bold">
          <Plus size={14} className="mr-1" /> ADD ANOTHER PRODUCT
        </Button>
      </div>

      {indexToDelete != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border-destructive/30 max-w-sm w-full rounded-lg p-4 space-y-3">
            <h3 className="text-foreground font-bold">Remove Product?</h3>
            <p className="text-muted-foreground font-mono text-xs">
              Remove &ldquo;{products[indexToDelete]?.product || 'this product'}&rdquo; from this spray mix?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIndexToDelete(null)} className="touch-target border-border text-muted-foreground">Cancel</Button>
              <Button
                onClick={() => { removeProduct(indexToDelete); setIndexToDelete(null); }}
                className="touch-target bg-destructive text-destructive-foreground glow-destructive"
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
