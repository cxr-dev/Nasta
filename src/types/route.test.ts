import { describe, it, expect } from 'vitest';
import type { Page, Segment, TransportType } from './route';

describe('Page type', () => {
  it('should accept valid page object with segments', () => {
    const page: Page = {
      id: '1',
      name: 'Arbete',
      segments: [
        {
          id: 's1',
          line: '76',
          lineName: 'Buss 76',
          direction: { code: 1, destination: 'mot Norra Hammarbyhamnen', stopPointId: '123' },
          fromStop: { id: '1', name: 'Lindarängsvägen', siteId: '9001' },
          toStop: { id: '2', name: 'Kungsträdgården', siteId: '9002' },
          transportType: 'bus'
        }
      ]
    };
    expect(page.id).toBe('1');
    expect(page.name).toBe('Arbete');
    expect(page.segments).toHaveLength(1);
  });

  it('should allow empty segments', () => {
    const page: Page = {
      id: '1',
      name: 'Hem',
      segments: []
    };
    expect(page.segments).toHaveLength(0);
  });

  it('should accept multiple pages without direction', () => {
    const page1: Page = {
      id: '1',
      name: 'Arbete',
      segments: []
    };
    const page2: Page = {
      id: '2',
      name: 'Hem',
      segments: []
    };
    expect(page1.name).toBe('Arbete');
    expect(page2.name).toBe('Hem');
  });
});