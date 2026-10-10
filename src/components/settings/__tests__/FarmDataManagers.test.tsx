/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    savedSeeds: [],
    addSeed: vi.fn(),
    deleteSeed: vi.fn(),
    sprayRecipes: [],
    addSprayRecipe: vi.fn(),
    deleteSprayRecipe: vi.fn(),
    updateSprayRecipe: vi.fn(),
    fertilizerRecipes: [],
    addFertilizerRecipe: vi.fn(),
    deleteFertilizerRecipe: vi.fn(),
    updateFertilizerRecipe: vi.fn(),
    session: null,
  }),
}));

import FertilizerRecipeManager from '../FertilizerRecipeManager';
import RecipeManager from '../RecipeManager';
import SeedManager from '../SeedManager';

describe('Farm Data managers', () => {
  it('keeps Seed Varieties collapsed until its header is clicked', () => {
    render(<SeedManager />);

    expect(screen.queryByPlaceholderText('e.g. DKC 64-35')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /seed varieties/i }));
    expect(screen.getByPlaceholderText('e.g. DKC 64-35')).toBeInTheDocument();
  });

  it('keeps Spray Recipes collapsed until its header is clicked', () => {
    render(<RecipeManager />);

    expect(screen.queryByRole('button', { name: /new recipe/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /spray recipes/i }));
    expect(screen.getByRole('button', { name: /new recipe/i })).toBeInTheDocument();
  });

  it('keeps Fertilizer Recipes collapsed until its header is clicked', () => {
    render(<FertilizerRecipeManager />);

    expect(screen.queryByRole('button', { name: /new recipe/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /fertilizer recipes/i }));
    expect(screen.getByRole('button', { name: /new recipe/i })).toBeInTheDocument();
  });
});
