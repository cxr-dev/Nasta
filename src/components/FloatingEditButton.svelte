<script lang="ts">
  import { scale, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  let { editing = false, onclick, dataOld = false }: { 
    editing?: boolean; 
    onclick: () => void;
    dataOld?: boolean;
  } = $props();

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

  function handleClick() {
    if (!isLongPress) {
      onclick();
    }
  }

  const pencilPath = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';
  const checkPath = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
</script>

<button
  class="fab"
  class:pressed={isPressed}
  class:pulse={dataOld || isLongPress}
  class:editing
  onclick={handleClick}
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerLeave}
  aria-label={editing ? 'Klar med redigering' : 'Redigera rutter'}
  in:scale={{ duration: 200, easing: quintOut, start: 0.8 }}
  out:scale={{ duration: 150, easing: quintOut, start: 0.8 }}
>
  <span class="fab-inner" class:rotate={isPressed && !editing}>
    {#if editing}
      <svg viewBox="0 0 24 24" class="fab-icon">
        <path d={checkPath} fill="currentColor"/>
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" class="fab-icon">
        <path d={pencilPath} fill="currentColor"/>
      </svg>
    {/if}
  </span>
  {#if dataOld && !editing}
    <span class="old-indicator" in:fade={{ duration: 150 }}></span>
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
    background: var(--accent, #2563EB);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 
      0 4px 16px rgba(37, 99, 235, 0.4),
      0 0 0 0 rgba(37, 99, 235, 0);
    transition: 
      transform 0.15s ease-out, 
      box-shadow 0.15s ease-out, 
      background 0.15s ease-out;
    z-index: 1000;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .fab:hover {
    box-shadow: 0 6px 24px rgba(37, 99, 235, 0.5);
    transform: scale(1.05);
  }

  .fab:active,
  .fab.pressed {
    transform: scale(0.92);
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
  }

  .fab.pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }

  .fab.pulse:hover {
    animation: none;
  }

  .fab.editing {
    background: #059669;
    box-shadow: 
      0 4px 16px rgba(5, 150, 105, 0.4),
      0 0 0 0 rgba(5, 150, 105, 0);
  }

  .fab.editing:hover {
    box-shadow: 0 6px 24px rgba(5, 150, 105, 0.5);
  }

  .fab-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .fab-inner.rotate {
    transform: rotate(-12deg) scale(1.1);
  }

  .fab-icon {
    width: 22px;
    height: 22px;
  }

  .old-indicator {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 12px;
    height: 12px;
    background: #EF4444;
    border-radius: 50%;
    border: 2px solid white;
    animation: pulseDot 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      box-shadow: 
        0 4px 16px rgba(37, 99, 235, 0.4),
        0 0 0 0 rgba(37, 99, 235, 0);
    }
    50% {
      box-shadow: 
        0 4px 24px rgba(37, 99, 235, 0.6),
        0 0 0 8px rgba(37, 99, 235, 0.1);
    }
  }

  @keyframes pulseDot {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.3);
      opacity: 0.8;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fab,
    .fab-inner,
    .old-indicator {
      transition: none;
      animation: none;
    }
  }
</style>