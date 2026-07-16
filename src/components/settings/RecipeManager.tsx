import { useState } from 'react';

import { Droplets, Plus, Trash2 } from 'lucide-react';

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFarm } from '@/store/farmStore';
import type { SprayRecipe } from '@/types/farm';

import RecipeForm from './RecipeForm';

export default function RecipeManager() {
  const { sprayRecipes, addSprayRecipe, deleteSprayRecipe, updateSprayRecipe, session } = useFarm();
  const userPrefix = session?.user?.id?.slice(0, 8) || "local";
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recipeToDelete, setRecipeToDelete] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
    <Card className="border-spray/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-spray text-lg">
          <Droplets size={18} />
          Spray Recipes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!adding && (
          <Button onClick={() => setAdding(true)} variant="outline" className="w-full border-spray/30 text-spray hover:bg-spray/10">
            <Plus size={16} className="mr-2" /> New Recipe
          </Button>
        )}
        {adding && (
          <RecipeForm
            onSave={async (r: Pick<SprayRecipe, 'name' | 'products' | 'applicatorName' | 'licenseNumber' | 'epaRegNumber' | 'targetPest' | 'cropOrSiteTreated'>) => {
              if (r.applicatorName) localStorage.setItem(`al_applicator_name_${userPrefix}`, r.applicatorName);
              if (r.licenseNumber) localStorage.setItem(`al_license_number_${userPrefix}`, r.licenseNumber);
              await addSprayRecipe(r);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {sprayRecipes.length === 0 && !adding && (
          <p className="text-muted-foreground text-sm">No recipes saved yet.</p>
        )}
        <div className="space-y-2">
          {sprayRecipes.map(recipe => (
            editingId === recipe.id ? (
              <RecipeForm
                key={recipe.id}
                initial={recipe}
                onSave={async (r: Pick<SprayRecipe, 'name' | 'products' | 'applicatorName' | 'licenseNumber' | 'epaRegNumber' | 'targetPest' | 'cropOrSiteTreated'>) => {
                  if (r.applicatorName) localStorage.setItem(`al_applicator_name_${userPrefix}`, r.applicatorName);
                  if (r.licenseNumber) localStorage.setItem(`al_license_number_${userPrefix}`, r.licenseNumber);
                  await updateSprayRecipe({ ...recipe, ...r });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={recipe.id} className="rounded-lg border border-border bg-muted/50 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground font-bold text-sm leading-snug">{recipe.name}</span>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setEditingId(recipe.id)} className="text-muted-foreground hover:text-foreground text-xs font-semibold underline">Edit</button>
                    <button
                      onClick={() => setRecipeToDelete({ id: recipe.id, name: recipe.name })}
                      className="text-destructive hover:text-destructive/80"
                      aria-label={`Delete ${recipe.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {recipe.cropOrSiteTreated && (
                  <div className="text-muted-foreground text-xs pl-2">Crop/site: <span className="text-foreground/70">{recipe.cropOrSiteTreated}</span></div>
                )}
                {recipe.products.map((p) => (
                  <div key={p.id ?? p.product} className="text-muted-foreground text-xs pl-2 leading-relaxed">
                    <span>• {p.product} — </span>
                    <span className="font-mono">{p.rate} {p.rateUnit}</span>
                    {p.epaRegNumber && <span className="ml-2 font-mono text-[11px] opacity-70">(EPA: {p.epaRegNumber})</span>}
                  </div>
                ))}
                {(recipe.applicatorName || recipe.licenseNumber || recipe.targetPest || recipe.epaRegNumber) && (
                  <div className="text-muted-foreground text-[11px] pl-2 pt-1 border-t border-border/50 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 leading-relaxed">
                    {recipe.applicatorName && <div>Applicator: <span className="text-foreground/70">{recipe.applicatorName}<span className="font-mono">{recipe.licenseNumber ? ` (${recipe.licenseNumber})` : ''}</span></span></div>}
                    {recipe.epaRegNumber && <div>Gen EPA: <span className="font-mono text-foreground/70">{recipe.epaRegNumber}</span></div>}
                    {recipe.targetPest && <div>Target: <span className="text-foreground/70">{recipe.targetPest}</span></div>}
                  </div>
                )}
              </div>
            )
          ))}
        </div>
      </CardContent>
    </Card>

      <AlertDialog open={!!recipeToDelete} onOpenChange={(open) => { if (!open) setRecipeToDelete(null); }}>
        <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Spray Recipe?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-mono text-xs">
              Delete &ldquo;{recipeToDelete?.name ?? 'this recipe'}&rdquo;? This removes the premix from your saved spray recipes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="touch-target border-border text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (recipeToDelete) await deleteSprayRecipe(recipeToDelete.id);
                setRecipeToDelete(null);
              }}
              className="touch-target bg-destructive text-destructive-foreground glow-destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
