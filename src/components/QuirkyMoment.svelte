<script lang="ts">
  import { timeOfDay, quirkyMessage, weatherEmoji, isSunlightMode, type WeatherCondition, type TimePeriod, type DayType } from '../lib/stores/timeOfDay';
  import { settingsStore } from '../stores/settingsStore';
  import { fade, fly, scale } from 'svelte/transition';
  import { onMount } from 'svelte';

  let showQuirky = $state(false);
  let showRare = $state(false);
  let rareMessage = $state('');
  let showConfetti = $state(false);
  let rareTrain = $state(false);
  
  let prefersReducedMotion = $state(false);
  let funMode = $derived($settingsStore.funMode ?? true);
  let notificationsEnabled = $derived($settingsStore.showNotifications ?? true);
  
  let weatherCondition = $derived($timeOfDay.weatherCondition);
  let period = $derived($timeOfDay.period);
  let dayType = $derived($timeOfDay.dayType);
  let hour = $derived($timeOfDay.hour);
  let onTimeStreak = $derived($timeOfDay.onTimeStreak);

  const rareMessages = [
    'Typiskt SL! 🚂💨',
    'Tåget är sent... igen 🤦',
    'SL strikes again! 😤',
    'Precis som vi älskade! 😂'
  ];

  const confettiMessages = [
    'Du är en legend! 🎉',
    'On-time master! ⭐',
    'Punktligast i stan! 🏆'
  ];

  function notificationDuration(text: string): number {
    return Math.max(2000, Math.min(6000, text.length * 60));
  }

  let quirkyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let rareTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function checkRareEvent() {
    if (!funMode || !notificationsEnabled) return;
    const random = Math.random();
    if (random < 0.02 && !showRare) {
      showRare = true;
      rareMessage = rareMessages[Math.floor(Math.random() * rareMessages.length)];
      if (rareTimeoutId) clearTimeout(rareTimeoutId);
      rareTimeoutId = setTimeout(() => {
        showRare = false;
      }, notificationDuration(rareMessage));
    }
  }

  function checkConfetti() {
    if (!funMode) return false;
    return onTimeStreak >= 5;
  }

  function shouldShowQuirky(): boolean {
    if (!funMode || !notificationsEnabled) return false;
    return period === 'morning' ||
           period === 'evening' ||
           (dayType === 'friday' && hour >= 15 && hour <= 17) ||
           dayType === 'weekend';
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      clearInterval(intervalId);
    } else {
      intervalId = setInterval(() => {
        checkRareEvent();
      }, 10000);
    }
  }

  let intervalId: ReturnType<typeof setInterval>;

  onMount(() => {
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const unsub = timeOfDay.subscribe((state) => {
      const shouldShow = shouldShowQuirky();
      if (shouldShow) {
        showQuirky = true;
        if (quirkyTimeoutId) clearTimeout(quirkyTimeoutId);
        quirkyTimeoutId = setTimeout(() => {
          showQuirky = false;
        }, notificationDuration($quirkyMessage));
      } else {
        showQuirky = false;
      }
    });

    intervalId = setInterval(() => {
      checkRareEvent();
    }, 10000);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsub();
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (quirkyTimeoutId) clearTimeout(quirkyTimeoutId);
      if (rareTimeoutId) clearTimeout(rareTimeoutId);
    };
  });

  function getWeatherAnimation(): string | null {
    if (!funMode) return null;
    if (weatherCondition === 'rain') return 'rain';
    if (weatherCondition === 'snow') return 'snow';
    return null;
  }
</script>

<svelte:window on:change={(e) => {
  const mql = e as unknown as MediaQueryListEvent;
  if (mql.media) prefersReducedMotion = mql.matches;
}} />

<div class="quirky-container">
  {#if showRare && funMode && notificationsEnabled}
    <div 
      class="rare-event"
      class:barrel-roll={rareTrain}
      in:fly={{ y: -20, duration: prefersReducedMotion ? 0 : 300 }}
      out:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
    >
      <span class="rare-icon">🚂</span>
      <span class="rare-text">{rareMessage}</span>
    </div>
  {/if}

  {#if showQuirky && funMode && notificationsEnabled}
    <div 
      class="quirky-badge"
      in:fly={{ y: -10, duration: prefersReducedMotion ? 0 : 400 }}
      out:fade={{ duration: prefersReducedMotion ? 0 : 300 }}
    >
      <span class="quirky-text">{$quirkyMessage}</span>
    </div>
  {/if}

  {#if checkConfetti() && funMode && notificationsEnabled && !showConfetti}
    <button 
      class="confetti-trigger"
      onclick={() => {
        showConfetti = true;
        setTimeout(() => showConfetti = false, 3000);
      }}
      aria-label="Visa firande"
    >
      <span class="confetti-icon">🎊</span>
    </button>
  {/if}

  {#if showConfetti && funMode && notificationsEnabled}
    <div 
      class="confetti-burst"
      in:scale={{ duration: prefersReducedMotion ? 0 : 200, start: 0 }}
      out:fade={{ duration: prefersReducedMotion ? 0 : 300 }}
    >
      <span class="confetti-text">{confettiMessages[Math.floor(Math.random() * confettiMessages.length)]}</span>
    </div>
  {/if}
</div>

{#if getWeatherAnimation() === 'rain' && funMode}
  <div class="weather-effects rain" aria-hidden="true">
    {#each Array(8) as _, i}
      <div class="raindrop" style="--delay: {i * 0.15}s; --x: {Math.random() * 100}%"></div>
    {/each}
  </div>
{/if}

{#if getWeatherAnimation() === 'snow' && funMode}
  <div class="weather-effects snow" aria-hidden="true">
    {#each Array(12) as _, i}
      <div class="snowflake" style="--delay: {i * 0.2}s; --x: {Math.random() * 100}%; --size: {4 + Math.random() * 6}px"></div>
    {/each}
  </div>
{/if}

<style>
  .quirky-container {
    position: fixed;
    top: 36px;
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
    max-width: 90%;
  }

  .quirky-text {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  }

  .rare-event.barrel-roll {
    animation: barrelRoll 0.8s ease-out;
  }

  .rare-icon {
    font-size: 18px;
    animation: shake 0.5s ease-in-out infinite;
  }

  .confetti-trigger {
    position: fixed;
    top: 36px;
    right: 12px;
    background: transparent;
    border: none;
    font-size: 24px;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s, transform 0.2s;
    pointer-events: auto;
    padding: 4px;
  }

  .confetti-trigger:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  .confetti-burst {
    position: fixed;
    top: 40px;
    right: 40px;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #fff;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(251, 191, 36, 0.5);
    animation: confettiPop 0.4s ease-out;
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

  @keyframes barrelRoll {
    0% { transform: rotate(0deg); }
    25% { transform: rotate(15deg); }
    50% { transform: rotate(-10deg); }
    75% { transform: rotate(5deg); }
    100% { transform: rotate(0deg); }
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-3px); }
    75% { transform: translateX(3px); }
  }

  @keyframes confettiPop {
    0% {
      transform: scale(0) rotate(-20deg);
      opacity: 0;
    }
    60% {
      transform: scale(1.2) rotate(5deg);
    }
    100% {
      transform: scale(1) rotate(0);
      opacity: 1;
    }
  }

  .weather-effects {
    position: fixed;
    top: 32px;
    left: 0;
    right: 0;
    height: 60px;
    pointer-events: none;
    overflow: hidden;
    z-index: 40;
  }

  .weather-effects.rain {
    background: linear-gradient(to bottom, transparent, rgba(59, 130, 246, 0.05));
  }

  .weather-effects.snow {
    background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.08));
  }

  .raindrop {
    position: absolute;
    top: -10px;
    left: var(--x);
    width: 2px;
    height: 20px;
    background: linear-gradient(to bottom, transparent, rgba(59, 130, 246, 0.6));
    animation: rainFall 0.8s linear infinite;
    animation-delay: var(--delay);
    border-radius: 1px;
  }

  @keyframes rainFall {
    0% { transform: translateY(0); opacity: 0; }
    20% { opacity: 1; }
    100% { transform: translateY(60px); opacity: 0; }
  }

  .snowflake {
    position: absolute;
    top: -10px;
    left: var(--x);
    width: var(--size);
    height: var(--size);
    background: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    animation: snowFall 3s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  @keyframes snowFall {
    0%, 100% { 
      transform: translateY(0) translateX(0); 
      opacity: 0; 
    }
    10% { opacity: 1; }
    50% { 
      transform: translateY(40px) translateX(10px); 
    }
    90% { opacity: 1; }
    100% { 
      transform: translateY(70px) translateX(-5px); 
      opacity: 0; 
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .quirky-badge,
    .rare-event,
    .confetti-burst,
    .raindrop,
    .snowflake {
      animation: none;
      transition: none;
    }
  }
</style>