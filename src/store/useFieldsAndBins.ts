import { useCallback } from 'react';
import { Field, Bin, SavedSeed, SprayRecipe, FertilizerRecipe } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { fieldService } from '@/services/fieldService';
import { binService } from '@/services/binService';
import { mapFieldToDb, mapBinToDb, mapSeedToDb, mapRecipeToDb, mapFertilizerRecipeToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UseFieldsAndBinsArgs {
  farm_id: string | null;
  setFields: React.Dispatch<React.SetStateAction<Field[]>>;
  setBins: React.Dispatch<React.SetStateAction<Bin[]>>;
  setSavedSeeds: React.Dispatch<React.SetStateAction<SavedSeed[]>>;
  setSprayRecipes: React.Dispatch<React.SetStateAction<SprayRecipe[]>>;
  setFertilizerRecipes: React.Dispatch<React.SetStateAction<FertilizerRecipe[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

export function useFieldsAndBins({
  farm_id, setFields, setBins,
  setSavedSeeds, setSprayRecipes,
  setFertilizerRecipes,
  isOnline, onMutation
}: UseFieldsAndBinsArgs) {
  // --- Fields ---
  const addField = useCallback(async (f: Omit<Field, 'id'>, requestedId?: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const id = requestedId ?? crypto.randomUUID();
    const newField: Field = { ...f, id, farm_id };
    
    let mapped: ReturnType<typeof mapFieldToDb>;
    try {
      mapped = mapFieldToDb(newField);
    } catch (err) {
      console.error('mapFieldToDb failed:', err);
      toast.error('Failed to prepare field — check inputs.');
      return false;
    }

    setFields(prev => [...prev, newField]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('fields', 'insert', mapped, farm_id);
        if (onMutation) await onMutation();
        toast.success('Field created offline!');
        return true;
      } catch (err) {
        console.error('Failed to enqueue add field offline:', err);
        setFields(prev => prev.filter(field => field.id !== id));
        toast.error('Failed to save field offline');
        return false;
      }
    }

    const { error } = await fieldService.createField(f, id, farm_id);

    if (error) {
      console.error('Supabase error adding field:', error);
      setFields(prev => prev.filter(field => field.id !== id));
      toast.error('Failed to save field');
      return false;
    } else {
      toast.success('Field created!');
      return true;
    }
  }, [farm_id, setFields, isOnline, onMutation]);

  const updateField = useCallback(async (f: Field): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    let mapped: ReturnType<typeof mapFieldToDb>;
    try {
      mapped = mapFieldToDb({ ...f, farm_id });
    } catch (err) {
      console.error('mapFieldToDb failed:', err);
      toast.error('Failed to prepare field — check inputs.');
      return false;
    }

    const previousRef: { current: Field | undefined } = { current: undefined };
    setFields(prev => {
      previousRef.current = prev.find(item => item.id === f.id);
      return prev.map(existing => existing.id === f.id ? f : existing);
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('fields', 'update', mapped, farm_id);
        if (onMutation) await onMutation();
        toast.success('Field updated offline');
        return true;
      } catch (err) {
        console.error('Failed to enqueue update field offline:', err);
        const previous = previousRef.current;
        if (previous) setFields(prev => prev.map(item => item.id === f.id ? previous : item));
        toast.error('Failed to update field offline');
        return false;
      }
    }

    const { data, error } = await fieldService.updateField(f, farm_id);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error('Supabase error updating field:', error);
      } else {
        console.warn('Field update affected zero rows:', f.id);
      }
      const previous = previousRef.current;
      if (previous) setFields(prev => prev.map(item => item.id === f.id ? previous : item));
      toast.error('Failed to update field');
      return false;
    } else {
      toast.success('Field updated');
      return true;
    }
  }, [farm_id, setFields, isOnline, onMutation]);

  const deleteField = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: Field | undefined } = { current: undefined };
    const deletedAt = new Date().toISOString();
    setFields(prev => {
      previousRef.current = prev.find(f => f.id === id);
      return prev.map(f =>
        f.id === id ? { ...f, deleted_at: deletedAt } : f
      );
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('fields', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Field deleted offline');
        return true;
      } catch (err) {
        console.error('Failed to enqueue delete field offline:', err);
        const previous = previousRef.current;
        if (previous) setFields(prev => prev.map(f => f.id === id ? previous : f));
        toast.error('Failed to delete field offline');
        return false;
      }
    }

    const { data, error } = await fieldService.softDeleteField(id, farm_id);
    if (error || !data || data.length === 0) {
      if (error) {
        console.error('Error deleting field:', error);
      } else {
        console.warn('Field delete affected zero rows:', id);
      }
      const previous = previousRef.current;
      if (previous) setFields(prev => prev.map(f => f.id === id ? previous : f));
      toast.error('Failed to delete field');
      return false;
    } else {
      toast.success('Field deleted');
      return true;
    }
  }, [farm_id, setFields, isOnline, onMutation]);

  // --- Bins ---
  const addBin = useCallback(async (b: Omit<Bin, 'id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const id = crypto.randomUUID();
    const newBin: Bin = { ...b, id, farm_id };

    let mapped: ReturnType<typeof mapBinToDb>;
    try {
      mapped = mapBinToDb(newBin);
    } catch (err) {
      console.error('mapBinToDb failed:', err);
      toast.error('Failed to prepare bin — check inputs.');
      return false;
    }

    setBins(prev => [...prev, newBin]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('bins', 'insert', mapped, farm_id);
        if (onMutation) await onMutation();
        toast.success('Bin created offline!');
        return true;
      } catch (err) {
        console.error('Failed to enqueue add bin offline:', err);
        setBins(prev => prev.filter(bin => bin.id !== id));
        toast.error('Failed to save bin offline');
        return false;
      }
    }

    const { error } = await binService.createBin(b, id, farm_id);
    if (error) {
      console.error('Error adding bin:', error);
      setBins(prev => prev.filter(bin => bin.id !== id));
      toast.error('Failed to save bin');
      return false;
    } else {
      toast.success('Bin created!');
      return true;
    }
  }, [farm_id, setBins, isOnline, onMutation]);

  const updateBin = useCallback(async (b: Bin): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    let mapped: ReturnType<typeof mapBinToDb>;
    try {
      mapped = mapBinToDb({ ...b, farm_id });
    } catch (err) {
      console.error('mapBinToDb failed:', err);
      toast.error('Failed to prepare bin — check inputs.');
      return false;
    }

    const previousRef: { current: Bin | undefined } = { current: undefined };
    setBins(prev => {
      previousRef.current = prev.find(item => item.id === b.id);
      return prev.map(existing => existing.id === b.id ? b : existing);
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('bins', 'update', mapped, farm_id);
        if (onMutation) await onMutation();
        toast.success('Bin updated offline');
        return true;
      } catch (err) {
        console.error('Failed to enqueue update bin offline:', err);
        const previous = previousRef.current;
        if (previous) setBins(prev => prev.map(item => item.id === b.id ? previous : item));
        toast.error('Failed to update bin offline');
        return false;
      }
    }

    const { data, error } = await binService.updateBin(b, farm_id);
    if (error || !data || data.length === 0) {
      if (error) {
        console.error('Error updating bin:', error);
      } else {
        console.warn('Bin update affected zero rows:', b.id);
      }
      const previous = previousRef.current;
      if (previous) setBins(prev => prev.map(item => item.id === b.id ? previous : item));
      toast.error('Failed to update bin');
      return false;
    } else {
      toast.success('Bin updated');
      return true;
    }
  }, [farm_id, setBins, isOnline, onMutation]);

  const deleteBin = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: Bin | undefined } = { current: undefined };
    const deletedAt = new Date().toISOString();
    setBins(prev => {
      previousRef.current = prev.find(b => b.id === id);
      return prev.map(b =>
        b.id === id ? { ...b, deleted_at: deletedAt } : b
      );
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('bins', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Bin deleted offline');
        return true;
      } catch (err) {
        console.error('Failed to enqueue delete bin offline:', err);
        const previous = previousRef.current;
        if (previous) setBins(prev => prev.map(b => b.id === id ? previous : b));
        toast.error('Failed to delete bin offline');
        return false;
      }
    }

    const { data, error } = await binService.softDeleteBin(id, farm_id);
    if (error || !data || data.length === 0) {
      if (error) {
        console.error('Error deleting bin:', error);
      } else {
        console.warn('Bin delete affected zero rows:', id);
      }
      const previous = previousRef.current;
      if (previous) setBins(prev => prev.map(b => b.id === id ? previous : b));
      toast.error('Failed to delete bin');
      return false;
    } else {
      toast.success('Bin deleted');
      return true;
    }
  }, [farm_id, setBins, isOnline, onMutation]);

  // --- Seeds ---
  const addSeed = useCallback(async (name: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const id = crypto.randomUUID();
    const newSeed: SavedSeed = { 
      id, name, farm_id, deleted_at: null,
      crop: '—', variety: '—', supplier: '—', lotNumber: '—', 
      year: new Date().getFullYear(), notes: '' 
    };

    let mapped: ReturnType<typeof mapSeedToDb>;
    try {
      mapped = mapSeedToDb(newSeed);
    } catch (err) {
      console.error('mapSeedToDb failed:', err);
      toast.error('Failed to prepare seed — check inputs.');
      return false;
    }

    setSavedSeeds(prev => [...prev, newSeed]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('saved_seeds', 'insert', mapped, farm_id);
        if (onMutation) await onMutation();
        toast.success('Seed variety added offline!');
        return true;
      } catch (err) {
        console.error('Failed to enqueue add seed offline:', err);
        setSavedSeeds(prev => prev.filter(s => s.id !== id));
        toast.error('Failed to save seed offline');
        return false;
      }
    }

    const { error } = await supabase.from('saved_seeds').insert([mapped]);
    if (error) {
      console.error('Error adding seed:', error);
      setSavedSeeds(prev => prev.filter(s => s.id !== id));
      toast.error('Failed to save seed');
      return false;
    } else {
      toast.success('Seed variety added!');
      return true;
    }
  }, [farm_id, setSavedSeeds, isOnline, onMutation]);

  const deleteSeed = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: SavedSeed | undefined } = { current: undefined };
    const deletedAt = new Date().toISOString();
    setSavedSeeds(prev => {
      previousRef.current = prev.find(s => s.id === id);
      return prev.filter(s => s.id !== id);
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('saved_seeds', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Seed variety removed offline');
        return true;
      } catch (err) {
        console.error('Failed to enqueue delete seed offline:', err);
        const previous = previousRef.current;
        if (previous) setSavedSeeds(prev => [...prev, previous]);
        toast.error('Failed to remove seed offline');
        return false;
      }
    }

    const { data, error } = await supabase
      .from('saved_seeds')
      .update({ deleted_at: deletedAt })
      .eq('id', id)
      .eq('farm_id', farm_id)
      .select('id');
    if (error || !data || data.length === 0) {
      if (error) {
        console.error('Error deleting seed:', error);
      } else {
        console.warn('Seed delete affected zero rows:', id);
      }
      const previous = previousRef.current;
      if (previous) setSavedSeeds(prev => [...prev, previous]);
      toast.error('Failed to delete seed');
      return false;
    } else {
      toast.success('Seed variety removed');
      return true;
    }
  }, [farm_id, setSavedSeeds, isOnline, onMutation]);

  // --- Spray Recipes ---
  const addSprayRecipe = useCallback(async (r: Omit<SprayRecipe, 'id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const id = crypto.randomUUID();
    const newRecipe: SprayRecipe = { ...r, id, farm_id };

    let mapped: ReturnType<typeof mapRecipeToDb>;
    try {
      mapped = mapRecipeToDb(newRecipe);
    } catch (err) {
      console.error('mapRecipeToDb failed:', err);
      toast.error('Failed to prepare recipe — check inputs.');
      return false;
    }

    setSprayRecipes(prev => [...prev, newRecipe]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('spray_recipes', 'insert', mapped, farm_id);
        if (onMutation) await onMutation();
        toast.success('Spray recipe created offline!');
        return true;
      } catch (err) {
        console.error('Failed to enqueue add spray recipe offline:', err);
        setSprayRecipes(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save recipe offline');
        return false;
      }
    }

    const { error } = await supabase.from('spray_recipes').insert([mapped]);
    if (error) {
      console.error('Error adding spray recipe:', error);
      setSprayRecipes(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save recipe');
      return false;
    } else {
      toast.success('Spray recipe created!');
      return true;
    }
  }, [farm_id, setSprayRecipes, isOnline, onMutation]);

  const updateSprayRecipe = useCallback(async (r: SprayRecipe): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    let mapped: ReturnType<typeof mapRecipeToDb>;
    try {
      mapped = mapRecipeToDb({ ...r, farm_id });
    } catch (err) {
      console.error('mapRecipeToDb failed:', err);
      toast.error('Failed to prepare recipe — check inputs.');
      return false;
    }

    const previousRef: { current: SprayRecipe | undefined } = { current: undefined };
    setSprayRecipes(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(existing => existing.id === r.id ? r : existing);
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('spray_recipes', 'update', mapped, farm_id);
        if (onMutation) await onMutation();
        toast.success('Spray recipe updated offline');
        return true;
      } catch (err) {
        console.error('Failed to enqueue update spray recipe offline:', err);
        const previous = previousRef.current;
        if (previous) setSprayRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
        toast.error('Failed to update recipe offline');
        return false;
      }
    }

    const { farm_id: _f, id: _i, ...payload } = mapped;
    const { data, error } = await supabase
      .from('spray_recipes')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id)
      .select('id');
 
    if (error || !data || data.length === 0) {
      if (error) {
        console.error('Error updating spray recipe:', error);
      } else {
        console.warn('Spray recipe update affected zero rows:', r.id);
      }
      const previous = previousRef.current;
      if (previous) setSprayRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update recipe');
      return false;
    } else {
      toast.success('Recipe updated');
      return true;
    }
  }, [farm_id, setSprayRecipes, isOnline, onMutation]);

  // --- Fertilizer Recipes ---
  const addFertilizerRecipe = useCallback(async (r: Omit<FertilizerRecipe, 'id' | 'farm_id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const id = crypto.randomUUID();
    const newRecipe: FertilizerRecipe = { ...r, id, farm_id, deleted_at: null };

    let mapped: ReturnType<typeof mapFertilizerRecipeToDb>;
    try {
      mapped = mapFertilizerRecipeToDb(newRecipe);
    } catch (err) {
      console.error('mapFertilizerRecipeToDb failed:', err);
      toast.error('Failed to prepare recipe — check inputs.');
      return false;
    }

    setFertilizerRecipes(prev => [...prev, newRecipe]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('fertilizer_recipes', 'insert', mapped, farm_id);
        if (onMutation) await onMutation();
        toast.success('Fertilizer recipe created offline!');
        return true;
      } catch (err) {
        console.error('Failed to enqueue add fertilizer recipe offline:', err);
        setFertilizerRecipes(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save recipe offline');
        return false;
      }
    }

    const { error } = await supabase.from('fertilizer_recipes').insert([mapped]);
    if (error) {
      console.error('Error adding fertilizer recipe:', error);
      setFertilizerRecipes(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save recipe');
      return false;
    } else {
      toast.success('Fertilizer recipe created!');
      return true;
    }
  }, [farm_id, setFertilizerRecipes, isOnline, onMutation]);

  const updateFertilizerRecipe = useCallback(async (r: FertilizerRecipe): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    let mapped: ReturnType<typeof mapFertilizerRecipeToDb>;
    try {
      mapped = mapFertilizerRecipeToDb({ ...r, farm_id });
    } catch (err) {
      console.error('mapFertilizerRecipeToDb failed:', err);
      toast.error('Failed to prepare recipe — check inputs.');
      return false;
    }

    const previousRef: { current: FertilizerRecipe | undefined } = { current: undefined };
    setFertilizerRecipes(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(existing => existing.id === r.id ? r : existing);
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('fertilizer_recipes', 'update', mapped, farm_id);
        if (onMutation) await onMutation();
        toast.success('Fertilizer recipe updated offline');
        return true;
      } catch (err) {
        console.error('Failed to enqueue update fertilizer recipe offline:', err);
        const previous = previousRef.current;
        if (previous) setFertilizerRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
        toast.error('Failed to update recipe offline');
        return false;
      }
    }

    const { farm_id: _f, id: _i, ...payload } = mapped;
    const { data, error } = await supabase
      .from('fertilizer_recipes')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id)
      .select('id');
 
    if (error || !data || data.length === 0) {
      if (error) {
        console.error('Error updating fertilizer recipe:', error);
      } else {
        console.warn('Fertilizer recipe update affected zero rows:', r.id);
      }
      const previous = previousRef.current;
      if (previous) setFertilizerRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update recipe');
      return false;
    } else {
      toast.success('Recipe updated');
      return true;
    }
  }, [farm_id, setFertilizerRecipes, isOnline, onMutation]);

  const deleteFertilizerRecipe = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: FertilizerRecipe | undefined } = { current: undefined };
    const deletedAt = new Date().toISOString();
    setFertilizerRecipes(prev => {
      previousRef.current = prev.find(r => r.id === id);
      return prev.filter(r => r.id !== id);
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('fertilizer_recipes', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Recipe removed offline');
        return true;
      } catch (err) {
        console.error('Failed to enqueue delete fertilizer recipe offline:', err);
        const previous = previousRef.current;
        if (previous) setFertilizerRecipes(prev => [...prev, previous]);
        toast.error('Failed to delete recipe offline');
        return false;
      }
    }

    const { data, error } = await supabase
      .from('fertilizer_recipes')
      .update({ deleted_at: deletedAt })
      .eq('id', id)
      .eq('farm_id', farm_id)
      .select('id');
    if (error || !data || data.length === 0) {
      if (error) {
        console.error('Error deleting fertilizer recipe:', error);
      } else {
        console.warn('Fertilizer recipe delete affected zero rows:', id);
      }
      const previous = previousRef.current;
      if (previous) setFertilizerRecipes(prev => [...prev, previous]);
      toast.error('Failed to delete recipe');
      return false;
    } else {
      toast.success('Recipe removed');
      return true;
    }
  }, [farm_id, setFertilizerRecipes, isOnline, onMutation]);

  const deleteSprayRecipe = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: SprayRecipe | undefined } = { current: undefined };
    const deletedAt = new Date().toISOString();
    setSprayRecipes(prev => {
      previousRef.current = prev.find(r => r.id === id);
      return prev.filter(r => r.id !== id);
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('spray_recipes', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Recipe removed offline');
        return true;
      } catch (err) {
        console.error('Failed to enqueue delete spray recipe offline:', err);
        const previous = previousRef.current;
        if (previous) setSprayRecipes(prev => [...prev, previous]);
        toast.error('Failed to delete recipe offline');
        return false;
      }
    }

    const { data, error } = await supabase
      .from('spray_recipes')
      .update({ deleted_at: deletedAt })
      .eq('id', id)
      .eq('farm_id', farm_id)
      .select('id');
    if (error || !data || data.length === 0) {
      if (error) {
        console.error('Error deleting spray recipe:', error);
      } else {
        console.warn('Spray recipe delete affected zero rows:', id);
      }
      const previous = previousRef.current;
      if (previous) setSprayRecipes(prev => [...prev, previous]);
      toast.error('Failed to delete recipe');
      return false;
    } else {
      toast.success('Recipe removed');
      return true;
    }
  }, [farm_id, setSprayRecipes, isOnline, onMutation]);

  return {
    addField, updateField, deleteField,
    addBin, updateBin, deleteBin,
    addSeed, deleteSeed,
    addSprayRecipe, updateSprayRecipe, deleteSprayRecipe,
    addFertilizerRecipe, updateFertilizerRecipe, deleteFertilizerRecipe,
  };
}
