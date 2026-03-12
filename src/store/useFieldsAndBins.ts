import { useCallback } from 'react';
import { Field, Bin, SavedSeed, SprayRecipe } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { fieldService } from '@/services/fieldService';
import { binService } from '@/services/binService';
import { mapSeedToDb, mapRecipeToDb } from '@/lib/mappers';

interface UseFieldsAndBinsArgs {
  farm_id: string | null;
  fields: Field[];
  setFields: React.Dispatch<React.SetStateAction<Field[]>>;
  bins: Bin[];
  setBins: React.Dispatch<React.SetStateAction<Bin[]>>;
  savedSeeds: SavedSeed[];
  setSavedSeeds: React.Dispatch<React.SetStateAction<SavedSeed[]>>;
  sprayRecipes: SprayRecipe[];
  setSprayRecipes: React.Dispatch<React.SetStateAction<SprayRecipe[]>>;
}

export function useFieldsAndBins({
  farm_id, fields, setFields, bins, setBins,
  savedSeeds, setSavedSeeds, sprayRecipes, setSprayRecipes
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
    const previous = fields.find(item => item.id === f.id);
    setFields(prev => prev.map(existing => existing.id === f.id ? f : existing));

    const { error } = await fieldService.updateField(f, farm_id);

    if (error) {
      console.error('Supabase error updating field:', error);
      if (previous) setFields(prev => prev.map(item => item.id === f.id ? previous : item));
      toast.error('Failed to update field');
    } else {
      toast.success('Field updated');
    }
  }, [farm_id, fields, setFields]);

  const deleteField = useCallback(async (id: string) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = fields.find(f => f.id === id);
    setFields(prev => prev.map(f =>
      f.id === id ? { ...f, deleted_at: new Date().toISOString() } : f
    ));
    const { error } = await fieldService.softDeleteField(id, farm_id);
    if (error) {
      console.error('Error deleting field:', error);
      if (previous) setFields(prev => prev.map(f => f.id === id ? previous : f));
      toast.error('Failed to delete field');
    } else {
      toast.success('Field deleted');
    }
  }, [farm_id, fields, setFields]);

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
    const previous = bins.find(item => item.id === b.id);
    setBins(prev => prev.map(existing => existing.id === b.id ? b : existing));
    const { error } = await binService.updateBin(b, farm_id);
    if (error) {
      console.error('Error updating bin:', error);
      if (previous) setBins(prev => prev.map(item => item.id === b.id ? previous : item));
      toast.error('Failed to update bin');
    } else {
      toast.success('Bin updated');
    }
  }, [farm_id, bins, setBins]);

  const deleteBin = useCallback(async (id: string) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = bins.find(b => b.id === id);
    setBins(prev => prev.map(b =>
      b.id === id ? { ...b, deleted_at: new Date().toISOString() } : b
    ));
    const { error } = await binService.softDeleteBin(id, farm_id);
    if (error) {
      console.error('Error deleting bin:', error);
      if (previous) setBins(prev => prev.map(b => b.id === id ? previous : b));
      toast.error('Failed to delete bin');
    } else {
      toast.success('Bin deleted');
    }
  }, [farm_id, bins, setBins]);

  // --- Seeds ---
  const addSeed = useCallback(async (name: string) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    setSavedSeeds(prev => [...prev, { id, name }]);
    const { error } = await supabase.from('saved_seeds').insert([
      mapSeedToDb({ id, name, farm_id })
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
    const previous = savedSeeds.find(s => s.id === id);
    setSavedSeeds(prev => prev.filter(s => s.id !== id));
    const { error } = await supabase
      .from('saved_seeds')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting seed:', error);
      if (previous) setSavedSeeds(prev => [...prev, previous]);
      toast.error('Failed to delete seed');
    } else {
      toast.success('Seed variety removed');
    }
  }, [farm_id, savedSeeds, setSavedSeeds]);

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
    const previous = sprayRecipes.find(item => item.id === r.id);
    setSprayRecipes(prev => prev.map(existing => existing.id === r.id ? r : existing));
    const { error } = await supabase.from('spray_recipes').upsert(
      mapRecipeToDb({ ...r, farm_id })
    );
    if (error) {
      console.error('Error updating spray recipe:', error);
      if (previous) setSprayRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update recipe');
    } else {
      toast.success('Recipe updated');
    }
  }, [farm_id, sprayRecipes, setSprayRecipes]);

  const deleteSprayRecipe = useCallback(async (id: string) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = sprayRecipes.find(r => r.id === id);
    setSprayRecipes(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase
      .from('spray_recipes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting spray recipe:', error);
      if (previous) setSprayRecipes(prev => [...prev, previous]);
      toast.error('Failed to delete recipe');
    } else {
      toast.success('Recipe removed');
    }
  }, [farm_id, sprayRecipes, setSprayRecipes]);

  return {
    addField, updateField, deleteField,
    addBin, updateBin, deleteBin,
    addSeed, deleteSeed,
    addSprayRecipe, updateSprayRecipe, deleteSprayRecipe,
  };
}
