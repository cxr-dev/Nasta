import { describe, expect, it } from 'vitest';
import type { TransitStopSearchResult } from '../providers/types';
import { rankStopSearchResults } from './stopSearchRanking';

const stops: TransitStopSearchResult[] = [
  { id: 'sl:3112', name: 'Slottshagen', coord: [59.499, 18.044], modes: [], relevance: 99, locationType: 'stop' },
  { id: 'sl:1342', name: 'Slottsbacken', coord: [59.325, 18.071], modes: [], relevance: 10, locationType: 'stop' },
];

describe('rankStopSearchResults', () => {
  it('uses distance for comparable text matches near Gamla stan', () => {
    expect(rankStopSearchResults(stops, 'Slotts', [59.325, 18.071]).map((stop) => stop.id))
      .toEqual(['sl:1342', 'sl:3112']);
  });

  it('keeps an exact name ahead of nearby partial matches', () => {
    expect(rankStopSearchResults(stops, 'Slottshagen', [59.325, 18.071])[0].id).toBe('sl:3112');
  });

  it('keeps a distant exact match ahead of a nearby prefix match', () => {
    const results: TransitStopSearchResult[] = [
      { id: 'sl:exact', name: 'Rök', coord: [59.9, 18.06], modes: [], relevance: 10, locationType: 'stop' },
      { id: 'sl:prefix', name: 'Rökubbsgatan', coord: [59.331, 18.061], modes: [], relevance: 99, locationType: 'stop' },
    ];

    expect(rankStopSearchResults(results, 'rök', [59.33, 18.06])[0].id).toBe('sl:exact');
  });

  it('puts a nearby Rökubbsgatan ahead of distant Röksta despite lower relevance', () => {
    const results: TransitStopSearchResult[] = [
      { id: 'sl:roksta', name: 'Röksta', coord: [59.9, 18.06], modes: [], relevance: 99, locationType: 'stop' },
      { id: 'sl:rokubbsgatan', name: 'Rökubbsgatan', coord: [59.331, 18.061], modes: [], relevance: 10, locationType: 'stop' },
    ];

    expect(rankStopSearchResults(results, 'rök', [59.33, 18.06]).map((stop) => stop.id))
      .toEqual(['sl:rokubbsgatan', 'sl:roksta']);
  });

  it('puts known computed distances ahead of results without coordinates', () => {
    const results: TransitStopSearchResult[] = [
      { id: 'sl:unknown', name: 'Röksta', modes: [], relevance: 99, locationType: 'stop' },
      { id: 'sl:known', name: 'Rökubbsgatan', coord: [59.331, 18.061], modes: [], relevance: 10, locationType: 'stop' },
    ];

    expect(rankStopSearchResults(results, 'rök', [59.33, 18.06]).map((stop) => stop.id))
      .toEqual(['sl:known', 'sl:unknown']);
  });

  it('keeps text relevance ordering when no location is available', () => {
    expect(rankStopSearchResults(stops, 'Slotts').map((stop) => stop.id))
      .toEqual(['sl:3112', 'sl:1342']);
  });
});
