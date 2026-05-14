import { useState } from 'react';
import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sprout, Plus, Trash2, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

export default function FertilizerRecipeManager() {
  const { fertilizerRecipes, addFertilizerRecipe, updateFertilizerRecipe, deleteFertilizerRecipe } = useFarm();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [formula, setFormula] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setFormula('');
    setAdding(false);
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!name.trim() || !formula.trim()) {
      toast.error('Name and formula are required');
      return;
    }
    setIsSaving(true);
    try {
      await addFertilizerRecipe({
        name: name.trim(),
        npkRatio: formula.trim(),
        deleted_at: null
      });
      resetForm();
    } catch (err) {
      toast.error('Failed to add recipe');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!name.trim() || !formula.trim()) {
      toast.error('Name and formula are required');
      return;
    }
    setIsSaving(true);
    try {
      await updateFertilizerRecipe({
        id,
        name: name.trim(),
        npkRatio: formula.trim(),
        deleted_at: null
      });
      resetForm();
    } catch (err) {
      toast.error('Failed to update recipe');
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (recipe: any) => {
    setEditingId(recipe.id);
    setName(recipe.name);
    setFormula(recipe.npkRatio);
    setAdding(false);
  };

  return (
    <Card className="border-lime-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lime-600 dark:text-lime-400 text-lg">
          <Sprout size={18} />
          Fertilizer Recipes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!adding && editingId === null && (
          <Button 
            onClick={() => setAdding(true)} 
            variant="outline" 
            className="w-full border-lime-500/30 text-lime-600 hover:bg-lime-500/10"
          >
            <Plus size={16} className="mr-2" /> New Recipe
          </Button>
        )}

        {adding && (
          <div className="bg-muted p-3 rounded-lg space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="space-y-1.5">
              <Label htmlFor="newRecipeName" className="text-[10px] uppercase font-mono text-muted-foreground">Recipe Name</Label>
              <Input 
                id="newRecipeName"
                name="newRecipeName"
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="e.g. Corn Pre-plant" 
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newRecipeFormula" className="text-[10px] uppercase font-mono text-muted-foreground">Formula / NPK</Label>
              <Input 
                id="newRecipeFormula"
                name="newRecipeFormula"
                value={formula} 
                onChange={e => setFormula(e.target.value)} 
                placeholder="e.g. 28-0-0" 
                className="h-9 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} size="sm" className="flex-1 h-9 bg-lime-600 hover:bg-lime-700" disabled={isSaving}>
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} className="mr-2" />}
                Save
              </Button>
              <Button onClick={resetForm} variant="ghost" size="sm" className="h-9">
                <X size={16} />
              </Button>
            </div>
          </div>
        )}

        {fertilizerRecipes.length === 0 && !adding && (
          <p className="text-muted-foreground text-sm py-4 text-center">No recipes saved yet.</p>
        )}

        <div className="space-y-2">
          {fertilizerRecipes.map(recipe => (
            editingId === recipe.id ? (
              <div key={recipe.id} className="bg-muted p-3 rounded-lg space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`editRecipeName-${recipe.id}`} className="text-[10px] uppercase font-mono text-muted-foreground">Recipe Name</Label>
                  <Input 
                    id={`editRecipeName-${recipe.id}`}
                    name={`editRecipeName-${recipe.id}`}
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`editRecipeFormula-${recipe.id}`} className="text-[10px] uppercase font-mono text-muted-foreground">Formula / NPK</Label>
                  <Input 
                    id={`editRecipeFormula-${recipe.id}`}
                    name={`editRecipeFormula-${recipe.id}`}
                    value={formula} 
                    onChange={e => setFormula(e.target.value)} 
                    className="h-9 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleUpdate(recipe.id)} size="sm" className="flex-1 h-9 bg-lime-600 hover:bg-lime-700" disabled={isSaving}>
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} className="mr-2" />}
                    Update
                  </Button>
                  <Button onClick={resetForm} variant="ghost" size="sm" className="h-9">
                    <X size={16} />
                  </Button>
                </div>
              </div>
            ) : (
              <div key={recipe.id} className="bg-muted/50 rounded-lg p-3 group">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-foreground font-bold text-sm leading-tight">{recipe.name}</div>
                    <div className="text-lime-600 dark:text-lime-400 font-mono text-xs mt-0.5">{recipe.npkRatio}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => startEdit(recipe)}
                    >
                      <span className="text-[10px] font-mono underline">Edit</span>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                      onClick={async () => {
                        if (confirm(`Delete recipe "${recipe.name}"?`)) {
                          await deleteFertilizerRecipe(recipe.id);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
