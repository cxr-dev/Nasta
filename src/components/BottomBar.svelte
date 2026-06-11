<script lang="ts">
  import { t } from '../stores/localeStore';

  let {
    editing,
    onboardingHighlight = false,
    onclick
  }: {
    editing: boolean;
    onboardingHighlight?: boolean;
    onclick: () => void;
  } = $props();
</script>

<div class="floating-action-bar" role="toolbar" aria-label={$t.settings}>
  <button
    class="action-btn"
    class:is-editing={editing}
    class:onboarding-highlight={onboardingHighlight && !editing}
    {onclick}
    aria-label={editing ? $t.saveAriaLabel : $t.settingsAriaLabel}
  >
    {#if editing}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16.707 3.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 11.586 14.293 5.293a1 1 0 011.414 0z"/>
        <path d="M4 16v2h12v-2"/>
      </svg>
      <span>{$t.save}</span>
    {:else}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3h5M12 8h5M12 13h5M7 3l-4 4M7 8l-4 4M7 13l-4 4"/>
      </svg>
      <span>{$t.settings}</span>
    {/if}
  </button>
</div>

<style>
  .floating-action-bar {
    position: sticky;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    z-index: 200;
    pointer-events: none;
  }

  .action-btn {
    position: relative;
    overflow: visible;
    width: min(100%, 320px);
    padding: 14px 20px;
    background: var(--accent-subtle);
    border: 1px solid var(--border);
    border-radius: 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 150ms ease;
    -webkit-tap-highlight-color: transparent;
    pointer-events: auto;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.10), 0 1px 4px rgba(0, 0, 0, 0.06);
  }

  .action-btn svg {
    width: 18px;
    height: 18px;
  }

  .action-btn:hover {
    opacity: 0.80;
  }

  .action-btn.is-editing {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }

  .action-btn.is-editing:hover {
    opacity: 0.88;
  }

  .action-btn.onboarding-highlight {
    box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.35);
    animation: pulse-ring 1300ms ease-out infinite;
  }

  .action-btn.onboarding-highlight::after {
    content: '';
    position: absolute;
    top: -8px;
    right: -8px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--accent);
    box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.4);
    animation: pulse-dot 1300ms ease-out infinite;
  }

  @keyframes pulse-ring {
    0% { box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.34); }
    80% { box-shadow: 0 0 0 12px rgba(23, 23, 23, 0); }
    100% { box-shadow: 0 0 0 0 rgba(23, 23, 23, 0); }
  }

  @keyframes pulse-dot {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(23, 23, 23, 0.35); }
    75% { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(23, 23, 23, 0); }
    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(23, 23, 23, 0); }
  }
</style>