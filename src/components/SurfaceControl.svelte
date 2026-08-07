<script lang="ts">
  let {
    kind,
    label,
    tone = 'default',
    onclick,
    class: className = '',
  }: {
    kind: 'back' | 'close';
    label: string;
    tone?: 'default' | 'overlay';
    onclick: () => void;
    class?: string;
  } = $props();
</script>

<button
  type="button"
  class="surface-control {tone} {className}"
  aria-label={label}
  data-surface-control
  {onclick}
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if kind === 'back'}
      <path d="m15 18-6-6 6-6" />
    {:else}
      <path d="M6 6l12 12M18 6 6 18" />
    {/if}
  </svg>
</button>

<style>
  .surface-control {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    display: grid;
    place-items: center;
    flex: 0 0 44px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: background-color 140ms ease, color 140ms ease, transform 100ms ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .surface-control:hover {
    background: var(--accent-subtle);
  }

  .surface-control:active {
    transform: scale(0.96);
  }

  .surface-control:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .surface-control.overlay {
    background: #171b1e;
    color: #fff;
  }

  .surface-control.overlay:hover {
    background: #0f1214;
  }

  .surface-control svg {
    width: 20px;
    height: 20px;
  }

  @media (prefers-reduced-motion: reduce) {
    .surface-control {
      transition: background-color 140ms ease, color 140ms ease;
    }

    .surface-control:active {
      transform: none;
    }
  }
</style>
