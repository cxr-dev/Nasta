import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import SettingsPanel from './SettingsPanel.svelte';
import { getSettings, setLocationServicesEnabled, setWalkingEtaEnabled } from '../stores/settingsStore.svelte';
import { createBackupDocument } from '../services/backup';
import { setLocale } from '../stores/localeStore.svelte';

const { mockExportBackupDocument } = vi.hoisted(() => ({ mockExportBackupDocument: vi.fn() }));
const mockRequestLocation = vi.fn();
const mockClearLocationSession = vi.fn();

vi.mock('../services/backup', async () => {
  const actual = await vi.importActual<typeof import('../services/backup')>('../services/backup');
  return {
    ...actual,
    exportBackupDocument: (...args: Parameters<typeof actual.exportBackupDocument>) => mockExportBackupDocument(...args),
  };
});

vi.mock('../services/geo', () => ({
  requestLocation: (...args: unknown[]) => mockRequestLocation(...args),
  clearLocationSession: (...args: unknown[]) => mockClearLocationSession(...args),
}));

beforeEach(() => {
  setLocale('sv');
  setLocationServicesEnabled(false);
  setWalkingEtaEnabled(false);
  mockExportBackupDocument.mockResolvedValue('downloaded');
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

  it('uses one muted landmark icon per feature group without duplicating switch labels', () => {
    const { container, getByRole } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });

    expect(container.querySelector('.section-title')).toBeNull();
    expect(container.querySelectorAll('.feature-icon')).toHaveLength(7);
    expect(container.querySelectorAll('.feature-icon[aria-hidden="true"]')).toHaveLength(7);
    expect(getByRole('switch', { name: 'Störningsvarningar' })).toBeTruthy();
    expect(getByRole('switch', { name: 'Platsjänster' })).toBeTruthy();
    expect(container.querySelectorAll('.group-title')).toHaveLength(3);
  });

  it('renders compact backup actions with full accessible names and decorative icons', () => {
    const { getByRole } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });

    const exportButton = getByRole('button', { name: 'Exportera säkerhetskopia' });
    const importButton = getByRole('button', { name: 'Importera säkerhetskopia' });

    expect(exportButton.textContent?.trim()).toBe('Exportera');
    expect(importButton.textContent?.trim()).toBe('Importera');
    expect(exportButton.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(importButton.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('uses the export helper and shows its native-share outcome', async () => {
    mockExportBackupDocument.mockResolvedValueOnce('shared');
    const { getByRole, getByText } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });

    expect(getByText('Välj ”Spara i Filer” för att välja en plats, eller dela säkerhetskopian.')).toBeTruthy();
    await fireEvent.click(getByRole('button', { name: 'Exportera säkerhetskopia' }));

    await waitFor(() => expect(mockExportBackupDocument).toHaveBeenCalledOnce());
    await waitFor(() => expect(getByRole('status').textContent).toBe('Säkerhetskopian skickades till vald app.'));
  });

  it('visually marks the selected language', async () => {
    const { getByRole } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });
    const swedish = getByRole('button', { name: 'Svenska' });

    await fireEvent.click(swedish);

    expect(swedish.classList.contains('active')).toBe(true);
  });

  it('uses the Lucide language and wine icons in the feature settings', () => {
    const { container, getByRole } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });

    const languageIcon = container.querySelector('.language-control')?.parentElement?.querySelector('.group-title svg');
    const afterworkIcon = getByRole('switch', { name: 'Afterwork' }).closest('.toggle-row')?.querySelector('svg');

    expect(languageIcon?.innerHTML).toContain('m5 8 6 6');
    expect(languageIcon?.innerHTML).toContain('m22 22-5-10-5 10');
    expect(afterworkIcon?.innerHTML).toContain('M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z');
    expect(afterworkIcon?.querySelectorAll('[stroke-width="2"]')).toHaveLength(4);
  });

  it('keeps the system theme description on its card without duplicate copy', async () => {
    const { container, getByRole, getByText } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });

    await fireEvent.click(getByRole('tab', { name: 'Teman' }));

    expect(getByRole('heading', { name: 'Temainställningar' })).toBeTruthy();
    expect(getByText('Följ enhetens inställning')).toBeTruthy();
    expect(container.querySelectorAll('.theme-choice-description')).toHaveLength(1);
    expect(container.querySelectorAll('.theme-description')).toHaveLength(0);
  });

  it('previews a valid backup in an inline labelled region with a safe cancel action', async () => {
    const { container, getByRole, getByText } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });
    const backup = new File([
      JSON.stringify(createBackupDocument([], getSettings(), new Date('2026-08-11T10:00:00.000Z'))),
    ], 'backup.json', { type: 'application/json' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await fireEvent.change(input, { target: { files: [backup] } });

    const preview = getByRole('region', { name: 'Hur vill du importera säkerhetskopian?' });
    await waitFor(() => expect(document.activeElement).toBe(preview));
    expect(getByText(/säkerhetskopia från/i)).toBeTruthy();
    expect(getByRole('button', { name: 'Ersätt nuvarande data' })).toBeTruthy();
    expect(getByRole('button', { name: 'Lägg till i nuvarande data' })).toBeTruthy();

    await fireEvent.click(getByRole('button', { name: 'Avbryt' }));

    expect(preview.isConnected).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(getByRole('button', { name: 'Importera säkerhetskopia' })));
  });

  it('focuses reset confirmation input and restores the trigger when cancelled', async () => {
    const { getByRole, getByLabelText } = render(SettingsPanel, { props: { isOpen: true, onClose: vi.fn() } });
    const trigger = getByRole('button', { name: 'Radera lokal appdata' });
    await fireEvent.click(trigger);

    const reset = getByRole('button', { name: 'Radera all data' }) as HTMLButtonElement;
    const input = getByLabelText('Skriv RESET för att bekräfta') as HTMLInputElement;
    const safeguard = getByRole('note');

    expect(safeguard.textContent).toContain('Detta går inte att ångra utan en tidigare exporterad säkerhetskopia.');
    expect(getByRole('button', { name: 'Exportera först' })).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(reset.textContent?.trim()).toBe('Radera');
    expect(reset.disabled).toBe(true);

    await fireEvent.input(input, { target: { value: 'RESET' } });
    expect(reset.disabled).toBe(false);

    await fireEvent.click(getByRole('button', { name: 'Avbryt' }));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
