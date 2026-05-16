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
  const addField = useCallback(async (f: Omit<Field, 'id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const id = crypto.randomUUID();
    setFields(prev => [...prev, { ...f, id, farm_id }]);

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
  }, [farm_id, setFields]);

  const updateField = useCallback(async (f: Field): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: Field | undefined } = { current: undefined };
    setFields(prev => {
      previousRef.current = prev.find(item => item.id === f.id);
      return prev.map(existing => existing.id === f.id ? f : existing);
    });

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
  }, [farm_id, setFields]);

  const deleteField = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: Field | undefined } = { current: undefined };
    setFields(prev => {
      previousRef.current = prev.find(f => f.id === id);
      return prev.map(f =>
        f.id === id ? { ...f, deleted_at: new Date().toISOString() } : f
      );
    });
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
  }, [farm_id, setFields]);

  // --- Bins ---
  const addBin = useCallback(async (b: Omit<Bin, 'id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const id = crypto.randomUUID();
    setBins(prev => [...prev, { ...b, id, farm_id }]);
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
  }, [farm_id, setBins]);

  const updateBin = useCallback(async (b: Bin): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: Bin | undefined } = { current: undefined };
    setBins(prev => {
      previousRef.current = prev.find(item => item.id === b.id);
      return prev.map(existing => existing.id === b.id ? b : existing);
    });
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
  }, [farm_id, setBins]);

  const deleteBin = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: Bin | undefined } = { current: undefined };
    setBins(prev => {
      previousRef.current = prev.find(b => b.id === id);
      return prev.map(b =>
        b.id === id ? { ...b, deleted_at: new Date().toISOString() } : b
      );
    });
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
  }, [farm_id, setBins]);

  // --- Seeds ---
  const addSeed = useCallback(async (name: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const id = crypto.randomUUID();
    setSavedSeeds(prev => [...prev, { 
      id, name, farm_id, deleted_at: null,
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
      return false;
    } else {
      toast.success('Seed variety added!');
      return true;
    }
  }, [farm_id, setSavedSeeds]);

  const deleteSeed = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: SavedSeed | undefined } = { current: undefined };
    setSavedSeeds(prev => {
      previousRef.current = prev.find(s => s.id === id);
      return prev.filter(s => s.id !== id);
    });
    const { data, error } = await supabase
      .from('saved_seeds')
      .update({ deleted_at: new Date().toISOString() })
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
  }, [farm_id, setSavedSeeds]);

  // --- Spray Recipes ---
  const addSprayRecipe = useCallback(async (r: Omit<SprayRecipe, 'id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
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
      return false;
    } else {
      toast.success('Spray recipe created!');
      return true;
    }
  }, [farm_id, setSprayRecipes]);

  const updateSprayRecipe = useCallback(async (r: SprayRecipe): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: SprayRecipe | undefined } = { current: undefined };
    setSprayRecipes(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(existing => existing.id === r.id ? r : existing);
    });
    const mapped = mapRecipeToDb({ ...r, farm_id });
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
  }, [farm_id, setSprayRecipes]);

  // --- Fertilizer Recipes ---
  const addFertilizerRecipe = useCallback(async (r: Omit<FertilizerRecipe, 'id' | 'farm_id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const id = crypto.randomUUID();
    setFertilizerRecipes(prev => [...prev, { ...r, id, farm_id }]);
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
    const previousRef: { current: FertilizerRecipe | undefined } = { current: undefined };
    setFertilizerRecipes(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(existing => existing.id === r.id ? r : existing);
    });
    const mapped = mapFertilizerRecipeToDb({ ...r, farm_id });
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
  }, [farm_id, setFertilizerRecipes]);

  const deleteFertilizerRecipe = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: FertilizerRecipe | undefined } = { current: undefined };
    setFertilizerRecipes(prev => {
      previousRef.current = prev.find(r => r.id === id);
      return prev.filter(r => r.id !== id);
    });
    const { data, error } = await supabase
      .from('fertilizer_recipes')
      .update({ deleted_at: new Date().toISOString() })
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
  }, [farm_id, setFertilizerRecipes]);

  const deleteSprayRecipe = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    const previousRef: { current: SprayRecipe | undefined } = { current: undefined };
    setSprayRecipes(prev => {
      previousRef.current = prev.find(r => r.id === id);
      return prev.filter(r => r.id !== id);
    });
    const { data, error } = await supabase
      .from('spray_recipes')
      .update({ deleted_at: new Date().toISOString() })
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
  }, [farm_id, setSprayRecipes]);

  return {
    addField, updateField, deleteField,
    addBin, updateBin, deleteBin,
    addSeed, deleteSeed,
    addSprayRecipe, updateSprayRecipe, deleteSprayRecipe,
    addFertilizerRecipe, updateFertilizerRecipe, deleteFertilizerRecipe,
  };
}
