import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SprayRecipe, SprayRecipeProduct } from '@/types/farm';
import { Plus, X, BookOpen } from 'lucide-react';
import { hasValidSprayRate } from '@/utils/unitConversion';

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
  const productToDelete = indexToDelete != null ? products[indexToDelete] : null;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="bg-spray/5 border border-spray/10 p-3.5 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="recipeSelect" className="text-xs font-semibold text-spray flex items-center gap-1.5 cursor-pointer">
            <BookOpen size={14} className="text-spray" />
            Load Saved Mix / Recipe
          </Label>
          {sprayRecipes.length === 0 && (
            <span className="text-[10px] font-mono text-muted-foreground">None saved</span>
          )}
        </div>
        {sprayRecipes.length > 0 ? (
          <Select value={selectedRecipeId} onValueChange={onRecipeSelect}>
            <SelectTrigger id="recipeSelect" className="h-11 bg-background border-spray/20 hover:border-spray/40 text-foreground text-sm font-semibold transition-all">
              <SelectValue placeholder="Tap to select a mix recipe..." />
            </SelectTrigger>
            <SelectContent>
              {sprayRecipes.map(r => (
                <SelectItem key={r.id} value={r.id} className="text-xs font-semibold">{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-[11px] text-muted-foreground leading-normal">
            No saved recipes yet. You can save any custom mix as a recipe after successfully logging a spray.
          </p>
        )}
      </div>

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
                  <Label htmlFor={`productName-${i}`} className="text-xs font-semibold text-muted-foreground">
                    Trade Name <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <Input
                    id={`productName-${i}`}
                    value={p.product}
                    onChange={e => updateProduct(i, 'product', e.target.value)}
                    placeholder="e.g. Roundup"
                    className={`mt-0.5 bg-background border-border text-foreground h-11 ${showValidation && !p.product.trim() ? 'border-destructive ring-1 ring-destructive' : ''}`}
                  />
                </div>
                <div className="col-span-1">
                  <Label htmlFor={`epaReg-${i}`} className="text-xs font-semibold text-muted-foreground">EPA Reg #</Label>
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
                <Label htmlFor={`activeIngredients-${i}`} className="text-xs font-semibold text-muted-foreground">Active Ingredients</Label>
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
                  <Label htmlFor={`appRate-${i}`} className="text-xs font-semibold text-muted-foreground">
                    Rate / Ac <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <div className="flex gap-1.5 mt-0.5">
                    <Input
                      id={`appRate-${i}`}
                      type="number"
                      inputMode="decimal"
                      value={p.rate}
                      onChange={e => updateProduct(i, 'rate', e.target.value)}
                      placeholder="22"
                      className={`bg-background border-border text-foreground h-11 px-2 w-20 ${showValidation && !hasValidSprayRate(p) ? 'border-yellow-500/50' : ''}`}
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
                  <Label htmlFor={`totalProduct-${i}`} className="text-xs font-semibold text-muted-foreground">Total Product Amt</Label>
                  <div className="flex gap-1.5 mt-0.5">
                    <Input
                      id={`totalProduct-${i}`}
                      type="number"
                      inputMode="decimal"
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

      <AlertDialog
        open={indexToDelete != null}
        onOpenChange={(open) => { if (!open) setIndexToDelete(null); }}
      >
        <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Remove Product?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-mono text-xs">
              Remove &ldquo;{productToDelete?.product || 'this product'}&rdquo; from this spray mix?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="touch-target border-border text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (indexToDelete != null) removeProduct(indexToDelete);
              }}
              className="touch-target bg-destructive text-destructive-foreground glow-destructive hover:bg-destructive/90"
            >
                Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
