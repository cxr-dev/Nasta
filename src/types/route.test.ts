import { describe, it, expect } from 'vitest';
import type { Route, Segment, Direction, TransportType } from './route';

describe('Route type', () => {
  it('should accept valid route object with segments', () => {
    const route: Route = {
      id: '1',
      name: 'Arbete',
      direction: 'toWork',
      segments: [
        {
          id: 's1',
          line: '76',
          lineName: 'Buss 76',
          directionText: 'mot Norra Hammarbyhamnen',
          fromStop: { id: '1', name: 'Lindarängsvägen', siteId: '9001' },
          toStop: { id: '2', name: 'Kungsträdgården', siteId: '9002' },
          transportType: 'bus'
        }
      ]
    };
    expect(route.id).toBe('1');
    expect(route.name).toBe('Arbete');
    expect(route.direction).toBe('toWork');
    expect(route.segments).toHaveLength(1);
  });

  it('should allow empty segments', () => {
    const route: Route = {
      id: '1',
      name: 'Hem',
      direction: 'fromWork',
      segments: []
    };
    expect(route.segments).toHaveLength(0);
  });

  it('should support both directions', () => {
    const toWork: Route = {
      id: '1',
      name: 'Arbete',
      direction: 'toWork',
      segments: []
    };
    const fromWork: Route = {
      id: '2',
      name: 'Arbete',
      direction: 'fromWork',
      segments: []
    };
    expect(toWork.direction).toBe('toWork');
    expect(fromWork.direction).toBe('fromWork');
  });
});