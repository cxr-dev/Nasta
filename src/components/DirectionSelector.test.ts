import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import DirectionSelector from './DirectionSelector.svelte';

const departures = [
  { directionCode: 2, destination: 'Hagsätra' },
  { directionCode: 1, destination: 'Hässelby strand' },
] as any;

describe('DirectionSelector', () => {
  it('confirms the selected direction and preserves the sorted order', async () => {
    const onSelect = vi.fn();
    const { getByLabelText, getByRole } = render(DirectionSelector, {
      props: { departures, onSelect },
    });

    const direction = getByLabelText('Hässelby strand') as HTMLInputElement;
    await fireEvent.click(direction);
    await fireEvent.click(getByRole('button', { name: 'Confirm' }));

    expect(onSelect).toHaveBeenCalledWith({
      code: 1,
      destination: 'Hässelby strand',
      stopPointId: '',
      intermediateStops: undefined,
    });
  });
});
