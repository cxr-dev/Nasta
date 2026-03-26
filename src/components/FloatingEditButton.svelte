<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  let { editing = false, onclick }: { editing?: boolean; onclick: () => void } = $props();

  let isPressed = $state(false);
  let isLongPress = $state(false);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  function handlePointerDown() {
    isPressed = true;
    longPressTimer = setTimeout(() => {
      isLongPress = true;
    }, 500);
  }

  function handlePointerUp() {
    isPressed = false;
    isLongPress = false;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handlePointerLeave() {
    isPressed = false;
    isLongPress = false;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  const iconPath = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';
</script>

<button
  class="fab"
  class:pressed={isPressed}
  class:pulse={isLongPress}
  class:editing
  onclick={onclick}
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerLeave}
  aria-label={editing ? 'Klar med redigering' : 'Redigera rutter'}
  in:scale={{ duration: 200, easing: quintOut, start: 0.8 }}
  out:scale={{ duration: 150, easing: quintOut, start: 0.8 }}
>
  {#if editing}
    <svg viewBox="0 0 24 24" class="fab-icon" style="transform: rotate(0deg);">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
    </svg>
  {:else}
    <svg viewBox="0 0 24 24" class="fab-icon" style="transform: rotate({isPressed ? -15 : 0}deg);">
      <path d={iconPath} fill="currentColor"/>
    </svg>
  {/if}
</button>

<style>
  .fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    background: var(--accent);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
    transition: transform 0.15s ease-out, box-shadow 0.15s ease-out, background 0.15s ease-out;
    z-index: 1000;
    -webkit-tap-highlight-color: transparent;
  }

  .fab:hover {
    box-shadow: 0 6px 24px rgba(37, 99, 235, 0.5);
    transform: scale(1.05);
  }

  .fab.pressed {
    transform: scale(0.95);
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
  }

  .fab.pulse {
    animation: pulse 1s ease-in-out infinite;
  }

  .fab.editing {
    background: #059669;
    box-shadow: 0 4px 16px rgba(5, 150, 105, 0.4);
  }

  .fab.editing:hover {
    box-shadow: 0 6px 24px rgba(5, 150, 105, 0.5);
  }

  .fab-icon {
    width: 24px;
    height: 24px;
    transition: transform 0.15s ease-out;
  }

  @keyframes pulse {
    0%, 100% {
      box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
    }
    50% {
      box-shadow: 0 4px 24px rgba(37, 99, 235, 0.7), 0 0 0 8px rgba(37, 99, 235, 0.1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fab,
    .fab-icon {
      transition: none;
      animation: none;
    }
  }
</style>
