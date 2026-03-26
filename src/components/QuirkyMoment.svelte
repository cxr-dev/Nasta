<script lang="ts">
  import { timeOfDay, quirkyMessage, type TimePeriod, type DayType } from '../lib/stores/timeOfDay';
  import { fade, fly } from 'svelte/transition';
  import { onMount } from 'svelte';

  let showQuirky = $state(false);
  let showRare = $state(false);
  let rareMessage = $state('');
  let showConfetti = $state(false);

  let lastRefresh = $state(0);
  let lastRefreshInterval: ReturnType<typeof setInterval> | null = null;

  const rareMessages = [
    'Typiskt SL! 🚂💨',
    'Tåget är sent... igen 🤦',
    'SL strikes again! 😤'
  ];

  function getAnimationStyle(period: TimePeriod): string {
    const base = 'transition: all 0.3s ease-out;';
    switch (period) {
      case 'morning':
        return base + 'animation: sunrise 2s ease-out;';
      case 'night':
        return base + 'animation: twinkle 1.5s infinite;';
      case 'evening':
        return base + 'animation: sunset 1.5s ease-out;';
      default:
        return base;
    }
  }

  function checkRareEvent() {
    const random = Math.random();
    if (random < 0.02 && !showRare) {
      showRare = true;
      rareMessage = rareMessages[Math.floor(Math.random() * rareMessages.length)];
      setTimeout(() => {
        showRare = false;
      }, 4000);
    }
  }

  onMount(() => {
    const unsubscribe = timeOfDay.subscribe((state) => {
      showQuirky = true;
      
      setTimeout(() => {
        showQuirky = false;
      }, 5000);
    });

    const interval = setInterval(() => {
      checkRareEvent();
    }, 10000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  });

  function handleReducedMotion(event: MediaQueryListEvent) {
    return;
  }
</script>

<svelte:window on:change={(e) => handleReducedMotion(e)} />

<div class="quirky-container">
  {#if showRare}
    <div 
      class="rare-event"
      in:fly={{ y: -20, duration: 300 }}
      out:fade={{ duration: 200 }}
    >
      <span class="rare-icon">🚂</span>
      <span class="rare-text">{rareMessage}</span>
    </div>
  {/if}

  {#if showQuirky}
    <div 
      class="quirky-badge"
      in:fly={{ y: -10, duration: 400 }}
      out:fade={{ duration: 300 }}
    >
      <span class="quirky-text">{$quirkyMessage}</span>
    </div>
  {/if}
</div>

<style>
  .quirky-container {
    position: fixed;
    top: 44px;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .quirky-badge {
    background: linear-gradient(135deg, var(--accent) 0%, #6366f1 100%);
    color: white;
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    cursor: default;
    animation: popIn 0.3s ease-out;
  }

  .rare-event {
    background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
    color: white;
    padding: 8px 20px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: barrelRoll 0.8s ease-out;
  }

  .rare-icon {
    font-size: 18px;
    animation: shake 0.5s ease-in-out infinite;
  }

  @keyframes popIn {
    0% {
      transform: scale(0.8) translateY(-10px);
      opacity: 0;
    }
    50% {
      transform: scale(1.05) translateY(0);
    }
    100% {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
  }

  @keyframes sunrise {
    0% {
      transform: translateY(-10px) rotate(-5deg);
      opacity: 0;
    }
    100% {
      transform: translateY(0) rotate(0);
      opacity: 1;
    }
  }

  @keyframes twinkle {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  @keyframes sunset {
    0% {
      transform: translateX(-10px);
      opacity: 0;
    }
    100% {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes barrelRoll {
    0% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(15deg);
    }
    50% {
      transform: rotate(-10deg);
    }
    75% {
      transform: rotate(5deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes shake {
    0%, 100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .quirky-badge,
    .rare-event {
      animation: none;
    }
  }
</style>
