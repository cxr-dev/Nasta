import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import SettingsPanel from './SettingsPanel.svelte';
import { getSettings, setLocationServicesEnabled, setWalkingEtaEnabled } from '../stores/settingsStore.svelte';
import { setLocale } from '../stores/localeStore.svelte';

const mockRequestLocation = vi.fn();
const mockClearLocationSession = vi.fn();

vi.mock('../services/geo', () => ({
  requestLocation: (...args: unknown[]) => mockRequestLocation(...args),
  clearLocationSession: (...args: unknown[]) => mockClearLocationSession(...args),
}));

beforeEach(() => {
  setLocale('sv');
  setLocationServicesEnabled(false);
  setWalkingEtaEnabled(false);
  mockRequestLocation.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('SettingsPanel location controls', () => {
  it('requests location exactly once when Platsjänster is enabled', async () => {
    const { getByRole } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });

    await fireEvent.click(getByRole('switch', { name: 'Platsjänster' }));

    expect(getSettings().locationServicesEnabled).toBe(true);
    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
  });

  it('clears the shared session when Platsjänster is disabled', async () => {
    setLocationServicesEnabled(true);
    const { getByRole } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });

    await fireEvent.click(getByRole('switch', { name: 'Platsjänster' }));

    expect(getSettings().locationServicesEnabled).toBe(false);
    expect(mockClearLocationSession).toHaveBeenCalledTimes(1);
  });

  it('requests location when Walking ETA is explicitly enabled', async () => {
    setLocationServicesEnabled(true);
    const { getByRole } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });

    await fireEvent.click(getByRole('switch', { name: 'Gång-ETA' }));

    expect(getSettings().walkingEtaEnabled).toBe(true);
    expect(mockRequestLocation).toHaveBeenCalledTimes(1);
  });
});
