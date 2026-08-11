import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import SettingsPanel from './SettingsPanel.svelte';
import { getSettings, setLocationServicesEnabled, setWalkingEtaEnabled } from '../stores/settingsStore.svelte';
import { createBackupDocument } from '../services/backup';
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
  it('renders one Close icon after the sheet title', () => {
    const { getByRole } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });

    const dialog = getByRole('dialog');
    const header = dialog.querySelector('.sheet-header')!;
    const close = getByRole('button', { name: 'Stäng inställningar' });

    expect(close.querySelectorAll('svg')).toHaveLength(1);
    expect(close.querySelector('path')?.getAttribute('d')).toBe('M6 6l12 12M18 6 6 18');
    expect(header.lastElementChild).toBe(close);
  });

  it('invokes Close once when Escape bubbles from sheet content', async () => {
    const onClose = vi.fn();
    const { getByRole } = render(SettingsPanel, { props: { isOpen: true, onClose } });
    const close = getByRole('button', { name: 'Stäng inställningar' });

    close.focus();
    await fireEvent.keyDown(close, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('contains focus in the disruption information dialog and restores its trigger', async () => {
    const { getByRole } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });
    const trigger = getByRole('button', { name: 'Förklaring av störningsnivåer' });
    await fireEvent.click(trigger);

    const dialog = getByRole('dialog', { name: 'Störningsnivåer — Förklaring' });
    const close = getByRole('button', { name: 'Stäng information' });
    await waitFor(() => expect(document.activeElement).toBe(close));

    await fireEvent.click(close);
    expect(dialog.isConnected).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

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

  it('previews a valid backup before offering import modes', async () => {
    const { container, getByRole, getByText } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });
    const backup = new File([
      JSON.stringify(createBackupDocument([], getSettings(), new Date('2026-08-11T10:00:00.000Z'))),
    ], 'backup.json', { type: 'application/json' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await fireEvent.change(input, { target: { files: [backup] } });

    expect(getByRole('dialog', { name: 'Hur vill du importera säkerhetskopian?' })).toBeTruthy();
    expect(getByText(/säkerhetskopia från/i)).toBeTruthy();
    expect(getByRole('button', { name: 'Ersätt nuvarande data' })).toBeTruthy();
    expect(getByRole('button', { name: 'Lägg till i nuvarande data' })).toBeTruthy();
  });

  it('keeps reset disabled until RESET is typed', async () => {
    const { getByRole, getByLabelText } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });
    await fireEvent.click(getByRole('button', { name: 'Radera lokal appdata' }));

    const reset = getByRole('button', { name: 'Radera all data' }) as HTMLButtonElement;
    const input = getByLabelText('Skriv RESET för att bekräfta') as HTMLInputElement;
    expect(reset.disabled).toBe(true);

    await fireEvent.input(input, { target: { value: 'RESET' } });
    expect(reset.disabled).toBe(false);
  });
});
