import { describe, it, expect } from 'vitest';
import type { TransportType } from '../types/route';

// Test the badge text derivation logic before embedding it in the component
function getLineBadge(transportType: TransportType, line: string): string {
  switch (transportType) {
    case 'metro': return `T${line}`;
    case 'train': return `J${line}`;
    default: return line;
  }
}

describe('getLineBadge', () => {
  it('prefixes T for metro', () => expect(getLineBadge('metro', '13')).toBe('T13'));
  it('prefixes J for train', () => expect(getLineBadge('train', '35')).toBe('J35'));
  it('returns line as-is for bus', () => expect(getLineBadge('bus', '74')).toBe('74'));
  it('returns line as-is for boat', () => expect(getLineBadge('boat', '421')).toBe('421'));
});
