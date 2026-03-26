import { describe, it, expect } from 'vitest';

// Token names we rely on in the new design
const REQUIRED_TOKENS = [
  '--bg', '--surface', '--border', '--border-subtle',
  '--text', '--text-secondary', '--text-muted', '--text-ghost',
  '--brand-muted', '--route-work', '--route-home',
  '--accent', '--danger'
];

describe('CSS tokens', () => {
  it('all required tokens are listed', () => {
    // This test just documents the required set.
    expect(REQUIRED_TOKENS.length).toBe(13);
  });
});
