import { useCallback } from 'react';
import { Field, Bin, SavedSeed, SprayRecipe, FertilizerRecipe } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { fieldService } from '@/services/fieldService';
import { binService } from '@/services/binService';
import { mapSeedToDb, mapRecipeToDb, mapFertilizerRecipeToDb } from '@/lib/mappers';

interface UseFieldsAndBinsArgs {
  farm_id: string | null;
  setFields: React.Dispatch<React.SetStateAction<Field[]>>;
  setBins: React.Dispatch<React.SetStateAction<Bin[]>>;
  setSavedSeeds: React.Dispatch<React.SetStateAction<SavedSeed[]>>;
  setSprayRecipes: React.Dispatch<React.SetStateAction<SprayRecipe[]>>;
  setFertilizerRecipes: React.Dispatch<React.SetStateAction<FertilizerRecipe[]>>;
}

export function useFieldsAndBins({
  farm_id, setFields, setBins,
  setSavedSeeds, setSprayRecipes,
  setFertilizerRecipes
}: UseFieldsAndBinsArgs) {

  // --- Fields ---
  const addField = useCallback(async (f: Omit<Field, 'id'>) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    setFields(prev => [...prev, { ...f, id }]);

    const { error } = await fieldService.createField(f, id, farm_id);

    if (error) {
      console.error('Supabase error adding field:', error);
      setFields(prev => prev.filter(field => field.id !== id));
      toast.error('Failed to save field');
    } else {
      toast.success('Field created!');
    }
  }, [farm_id, setFields]);

  const updateField = useCallback(async (f: Field) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    let capturedPrevious: Field | undefined;
    setFields(prev => {
      capturedPrevious = prev.find(item => item.id === f.id);
      return prev.map(existing => existing.id === f.id ? f : existing);
    });

    const { error } = await fieldService.updateField(f, farm_id);

    if (error) {
      console.error('Supabase error updating field:', error);
      if (capturedPrevious) setFields(prev => prev.map(item => item.id === f.id ? capturedPrevious! : item));
      toast.error('Failed to update field');
    } else {
      toast.success('Field updated');
    }
    return { error };
  }, [farm_id, setFields]);

  const deleteField = useCallback(async (id: string) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    let capturedPrevious: Field | undefined;
    setFields(prev => {
      capturedPrevious = prev.find(f => f.id === id);
      return prev.map(f =>
        f.id === id ? { ...f, deleted_at: new Date().toISOString() } : f
      );
    });
    const { error } = await fieldService.softDeleteField(id, farm_id);
    if (error) {
      console.error('Error deleting field:', error);
      if (capturedPrevious) setFields(prev => prev.map(f => f.id === id ? capturedPrevious! : f));
      toast.error('Failed to delete field');
    } else {
      toast.success('Field deleted');
    }
  }, [farm_id, setFields]);

  // --- Bins ---
  const addBin = useCallback(async (b: Omit<Bin, 'id'>) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    setBins(prev => [...prev, { ...b, id }]);
    const { error } = await binService.createBin(b, id, farm_id);
    if (error) {
      console.error('Error adding bin:', error);
      setBins(prev => prev.filter(bin => bin.id !== id));
      toast.error('Failed to save bin');
    } else {
      toast.success('Bin created!');
    }
  }, [farm_id, setBins]);

  const updateBin = useCallback(async (b: Bin) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    let capturedPrevious: Bin | undefined;
    setBins(prev => {
      capturedPrevious = prev.find(item => item.id === b.id);
      return prev.map(existing => existing.id === b.id ? b : existing);
    });
    const { error } = await binService.updateBin(b, farm_id);
    if (error) {
      console.error('Error updating bin:', error);
      if (capturedPrevious) setBins(prev => prev.map(item => item.id === b.id ? capturedPrevious! : item));
      toast.error('Failed to update bin');
    } else {
      toast.success('Bin updated');
    }
  }, [farm_id, setBins]);

  const deleteBin = useCallback(async (id: string) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    let capturedPrevious: Bin | undefined;
    setBins(prev => {
      capturedPrevious = prev.find(b => b.id === id);
      return prev.map(b =>
        b.id === id ? { ...b, deleted_at: new Date().toISOString() } : b
      );
    });
    const { error } = await binService.softDeleteBin(id, farm_id);
    if (error) {
      console.error('Error deleting bin:', error);
      if (capturedPrevious) setBins(prev => prev.map(b => b.id === id ? capturedPrevious! : b));
      toast.error('Failed to delete bin');
    } else {
      toast.success('Bin deleted');
    }
  }, [farm_id, setBins]);

  // --- Seeds ---
  const addSeed = useCallback(async (name: string) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    setSavedSeeds(prev => [...prev, { 
      id, name, deleted_at: null, 
      crop: '—', variety: '—', supplier: '—', lotNumber: '—', 
      year: new Date().getFullYear(), notes: '' 
    }]);
    const { error } = await supabase.from('saved_seeds').insert([
      mapSeedToDb({ 
        id, name, farm_id, deleted_at: null,
        crop: '—', variety: '—', supplier: '—', lotNumber: '—',
        year: new Date().getFullYear(), notes: ''
      })
    ]);
    if (error) {
      console.error('Error adding seed:', error);
      setSavedSeeds(prev => prev.filter(s => s.id !== id));
      toast.error('Failed to save seed');
    } else {
      toast.success('Seed variety added!');
    }
  }, [farm_id, setSavedSeeds]);

  const deleteSeed = useCallback(async (id: string) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    let capturedPrevious: SavedSeed | undefined;
    setSavedSeeds(prev => {
      capturedPrevious = prev.find(s => s.id === id);
      return prev.filter(s => s.id !== id);
    });
    const { error } = await supabase
      .from('saved_seeds')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting seed:', error);
      if (capturedPrevious) setSavedSeeds(prev => [...prev, capturedPrevious!]);
      toast.error('Failed to delete seed');
    } else {
      toast.success('Seed variety removed');
    }
  }, [farm_id, setSavedSeeds]);

  // --- Spray Recipes ---
  const addSprayRecipe = useCallback(async (r: Omit<SprayRecipe, 'id'>) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    setSprayRecipes(prev => [...prev, { ...r, id }]);
    const { error } = await supabase.from('spray_recipes').insert([
      mapRecipeToDb({ ...r, id, farm_id })
    ]);
    if (error) {
      console.error('Error adding spray recipe:', error);
      setSprayRecipes(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save recipe');
    } else {
      toast.success('Spray recipe created!');
    }
  }, [farm_id, setSprayRecipes]);

  const updateSprayRecipe = useCallback(async (r: SprayRecipe) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    let capturedPrevious: SprayRecipe | undefined;
    setSprayRecipes(prev => {
      capturedPrevious = prev.find(item => item.id === r.id);
      return prev.map(existing => existing.id === r.id ? r : existing);
    });
    const mapped = mapRecipeToDb({ ...r, farm_id });
    const { farm_id: _f, id: _i, ...payload } = mapped;
    const { error } = await supabase
      .from('spray_recipes')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id);

    if (error) {
      console.error('Error updating spray recipe:', error);
      if (capturedPrevious) setSprayRecipes(prev => prev.map(item => item.id === r.id ? capturedPrevious! : item));
      toast.error('Failed to update recipe');
    } else {
      toast.success('Recipe updated');
    }
  }, [farm_id, setSprayRecipes]);

  // --- Fertilizer Recipes ---
  const addFertilizerRecipe = useCallback(async (r: Omit<FertilizerRecipe, 'id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const id = crypto.randomUUID();
    setFertilizerRecipes(prev => [...prev, { ...r, id }]);
    const { error } = await supabase.from('fertilizer_recipes').insert([
      mapFertilizerRecipeToDb({ ...r, id, farm_id, deleted_at: null })
    ]);
    if (error) {
      console.error('Error adding fertilizer recipe:', error);
      setFertilizerRecipes(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save recipe');
      return false;
    } else {
      toast.success('Fertilizer recipe created!');
      return true;
    }
  }, [farm_id, setFertilizerRecipes]);

  const updateFertilizerRecipe = useCallback(async (r: FertilizerRecipe): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    let capturedPrevious: FertilizerRecipe | undefined;
    setFertilizerRecipes(prev => {
      capturedPrevious = prev.find(item => item.id === r.id);
      return prev.map(existing => existing.id === r.id ? r : existing);
    });
    const mapped = mapFertilizerRecipeToDb({ ...r, farm_id });
    const { farm_id: _f, id: _i, ...payload } = mapped;
    const { error } = await supabase
      .from('fertilizer_recipes')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id);

    if (error) {
      console.error('Error updating fertilizer recipe:', error);
      if (capturedPrevious) setFertilizerRecipes(prev => prev.map(item => item.id === r.id ? capturedPrevious! : item));
      toast.error('Failed to update recipe');
      return false;
    } else {
      toast.success('Recipe updated');
      return true;
    }
  }, [farm_id, setFertilizerRecipes]);

  const deleteFertilizerRecipe = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    let capturedPrevious: FertilizerRecipe | undefined;
    setFertilizerRecipes(prev => {
      capturedPrevious = prev.find(r => r.id === id);
      return prev.filter(r => r.id !== id);
    });
    const { error } = await supabase
      .from('fertilizer_recipes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting fertilizer recipe:', error);
      if (capturedPrevious) setFertilizerRecipes(prev => [...prev, capturedPrevious!]);
      toast.error('Failed to delete recipe');
      return false;
    } else {
      toast.success('Recipe removed');
      return true;
    }
  }, [farm_id, setFertilizerRecipes]);

  const deleteSprayRecipe = useCallback(async (id: string) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    let capturedPrevious: SprayRecipe | undefined;
    setSprayRecipes(prev => {
      capturedPrevious = prev.find(r => r.id === id);
      return prev.filter(r => r.id !== id);
    });
    const { error } = await supabase
      .from('spray_recipes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting spray recipe:', error);
      if (capturedPrevious) setSprayRecipes(prev => [...prev, capturedPrevious!]);
      toast.error('Failed to delete recipe');
    } else {
      toast.success('Recipe removed');
    }
  }, [farm_id, setSprayRecipes]);

  return {
    addField, updateField, deleteField,
    addBin, updateBin, deleteBin,
    addSeed, deleteSeed,
    addSprayRecipe, updateSprayRecipe, deleteSprayRecipe,
    addFertilizerRecipe, updateFertilizerRecipe, deleteFertilizerRecipe,
  };
}
