import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SprayWizardMixStep } from '../SprayWizardMixStep';
import type { SprayRecipeProduct } from '@/types/farm';

function renderStep(product: Partial<SprayRecipeProduct>, treatedAreaSize = '40') {
  const products: SprayRecipeProduct[] = [{ ui_id: 'p1', product: 'Roundup', rate: '30', rateUnit: 'fl oz/ac', ...product }];
  return render(
    <SprayWizardMixStep
      sprayRecipes={[]}
      selectedRecipeId=""
      products={products}
      showValidation={false}
      onRecipeSelect={vi.fn()}
      updateProduct={vi.fn()}
      addProduct={vi.fn()}
      removeProduct={vi.fn()}
      treatedAreaSize={treatedAreaSize}
      treatedAreaUnit="ac"
    />,
  );
}

describe('SprayWizardMixStep rate unit cues', () => {
  it('previews a liquid total in liquid units with no dry-weight warning', () => {
    renderStep({ rateUnit: 'fl oz/ac' });

    expect(screen.getByText(/on 40 ac/)).toHaveTextContent('= 9.38 gal on 40 ac');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('warns when a dry weight unit is selected and shows the total in pounds', () => {
    renderStep({ rateUnit: 'oz/ac' });

    expect(screen.getByRole('note')).toHaveTextContent('Dry weight unit. For a liquid product, switch to fl oz/ac.');
    expect(screen.getByText('75 lb')).toBeInTheDocument();
  });

  it('shows no total preview until there is a rate and an acre area', () => {
    renderStep({ rate: '' });
    expect(screen.queryByText(/on 40 ac/)).not.toBeInTheDocument();
  });
});
