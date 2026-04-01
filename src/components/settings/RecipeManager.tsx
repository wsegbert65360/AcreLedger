import { useState } from 'react';
import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Droplets, Plus, Trash2 } from 'lucide-react';
import RecipeForm from './RecipeForm';

export default function RecipeManager() {
  const { sprayRecipes, addSprayRecipe, deleteSprayRecipe, updateSprayRecipe, session } = useFarm();
  const userPrefix = session?.user?.id?.slice(0, 8) || "local";
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
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
            onSave={async (r: any) => {
              if (r.applicatorName) localStorage.setItem(`al_applicator_name_${userPrefix}`, r.applicatorName);
              if (r.licenseNumber) localStorage.setItem(`al_license_number_${userPrefix}`, r.licenseNumber);
              await addSprayRecipe(r);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {sprayRecipes.length === 0 && !adding && (
          <p className="text-muted-foreground text-sm font-mono">No recipes saved yet.</p>
        )}
        <div className="space-y-2">
          {sprayRecipes.map(recipe => (
            editingId === recipe.id ? (
              <RecipeForm
                key={recipe.id}
                initial={recipe}
                onSave={async (r: any) => {
                  if (r.applicatorName) localStorage.setItem(`al_applicator_name_${userPrefix}`, r.applicatorName);
                  if (r.licenseNumber) localStorage.setItem(`al_license_number_${userPrefix}`, r.licenseNumber);
                  await updateSprayRecipe({ ...r, id: recipe.id });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={recipe.id} className="bg-muted rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-foreground font-mono font-bold text-sm">{recipe.name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(recipe.id)} className="text-muted-foreground hover:text-foreground text-xs font-mono underline">Edit</button>
                    <button onClick={async () => { await deleteSprayRecipe(recipe.id); }} className="text-destructive hover:text-destructive/80">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {recipe.products.map((p) => (
                  <div key={p.id ?? p.product} className="text-muted-foreground font-mono text-xs pl-2">
                    • {p.product} — {p.rate} {p.rateUnit}
                    {p.epaRegNumber && <span className="ml-2 text-[10px] opacity-70">(EPA: {p.epaRegNumber})</span>}
                  </div>
                ))}
                {(recipe.applicatorName || recipe.licenseNumber || recipe.targetPest || recipe.epaRegNumber || recipe.cropOrSiteTreated) && (
                  <div className="text-muted-foreground font-mono text-[10px] pl-2 pt-1 border-t border-border/50 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {recipe.cropOrSiteTreated && <div>Crop: <span className="text-foreground/70">{recipe.cropOrSiteTreated}</span></div>}
                    {recipe.applicatorName && <div>Applicator: <span className="text-foreground/70">{recipe.applicatorName}{recipe.licenseNumber ? ` (${recipe.licenseNumber})` : ''}</span></div>}
                    {recipe.epaRegNumber && <div>Gen EPA: <span className="text-foreground/70">{recipe.epaRegNumber}</span></div>}
                    {recipe.targetPest && <div>Target: <span className="text-foreground/70">{recipe.targetPest}</span></div>}
                  </div>
                )}
              </div>
            )
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
