import { describe, it, expect } from 'vitest';
import type { Route, Stop } from './route';

describe('Route type', () => {
  it('should accept valid route object', () => {
    const route: Route = {
      id: '1',
      name: 'Jobb',
      transportType: 'metro',
      stops: [
        { id: '1', name: 'Lindarängsvägen', siteId: '9001' }
      ]
    };
    expect(route.id).toBe('1');
    expect(route.name).toBe('Jobb');
    expect(route.transportType).toBe('metro');
    expect(route.stops).toHaveLength(1);
  });

  it('should allow optional stop properties', () => {
    const stop: Stop = {
      id: '1',
      name: 'Test',
      siteId: '9001',
      line: '76',
      travelMinutesToNext: 5
    };
    expect(stop.line).toBe('76');
    expect(stop.travelMinutesToNext).toBe(5);
  });
});
