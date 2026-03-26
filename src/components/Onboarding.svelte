<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  let { onComplete }: { onComplete: () => void } = $props();

  let currentStep = $state(0);
  let direction = $state(1);

  const totalSteps = 3;

  const steps = [
    {
      emoji: '🚇',
      title: 'Välkommen till Nästa',
      subtitle: 'Din smarta resetusselskap i Stockholm',
      description: 'Få koll på nästa avgång – snabbt och enkelt.'
    },
    {
      emoji: '📱',
      title: 'Spara dina rutter',
      subtitle: 'Skapa rutt till jobbet och hem',
      description: 'Lägg till dina vanliga resor och få uppdateringar i realtid.'
    },
    {
      emoji: '⚡',
      title: 'Aldrig mer att vänta',
      subtitle: 'Ultra-glanceable design',
      description: 'Största siffran på skärmen = minuter till nästa avgång. Perfekt för stressade morgnar.'
    }
  ];

  function nextStep() {
    if (currentStep < totalSteps - 1) {
      direction = 1;
      currentStep++;
    } else {
      onComplete();
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      direction = -1;
      currentStep--;
    }
  }

  function skip() {
    onComplete();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      nextStep();
    } else if (e.key === 'ArrowLeft') {
      prevStep();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="onboarding">
  <div class="progress-bar">
    {#each Array(totalSteps) as _, i}
      <div class="progress-dot" class:active={i <= currentStep}></div>
    {/each}
  </div>

  <div class="slides-container">
    {#key currentStep}
      <div 
        class="slide"
        in:fly={{ x: direction * 100, duration: 300, easing: quintOut }}
        out:fly={{ x: direction * -100, duration: 250, easing: quintOut }}
      >
        <div class="step-emoji">{steps[currentStep].emoji}</div>
        <h1>{steps[currentStep].title}</h1>
        <p class="subtitle">{steps[currentStep].subtitle}</p>
        <p class="description">{steps[currentStep].description}</p>
      </div>
    {/key}
  </div>

  <div class="navigation">
    {#if currentStep < totalSteps - 1}
      <button class="skip-btn" onclick={skip} aria-label="Hoppa över introduktion">
        Hoppa över
      </button>
    {/if}
    
    <div class="nav-buttons">
      {#if currentStep > 0}
        <button class="back-btn" onclick={prevStep} aria-label="Föregående">
          Tillbaka
        </button>
      {/if}
      
      <button class="next-btn" onclick={nextStep} aria-label={currentStep === totalSteps - 1 ? 'Kom igång' : 'Nästa'}>
        {currentStep === totalSteps - 1 ? 'Kom igång!' : 'Nästa'}
      </button>
    </div>
  </div>
</div>

<style>
  .onboarding {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(180deg, #1E3A5F 0%, #0F172A 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 9999;
  }

  .progress-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 32px;
  }

  .progress-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transition: all 0.3s ease;
  }

  .progress-dot.active {
    background: #2563EB;
    width: 24px;
    border-radius: 4px;
  }

  .slides-container {
    position: relative;
    width: 100%;
    max-width: 320px;
    height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .slide {
    position: absolute;
    width: 100%;
    text-align: center;
    color: white;
  }

  .step-emoji {
    font-size: 72px;
    margin-bottom: 24px;
    animation: bounce 2s ease-in-out infinite;
  }

  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }

  h1 {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
    line-height: 1.2;
  }

  .subtitle {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 16px;
    font-weight: 500;
  }

  .description {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.5;
  }

  .navigation {
    width: 100%;
    max-width: 320px;
    margin-top: 48px;
  }

  .skip-btn {
    display: block;
    width: 100%;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    padding: 12px;
    cursor: pointer;
    margin-bottom: 16px;
  }

  .skip-btn:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  .nav-buttons {
    display: flex;
    gap: 12px;
  }

  .back-btn {
    flex: 1;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .next-btn {
    flex: 2;
    background: #2563EB;
    border: none;
    color: white;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
  }

  .next-btn:hover {
    background: #1D4ED8;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.5);
  }

  .next-btn:active {
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .step-emoji,
    .slide {
      animation: none;
      transition: none;
    }
  }
</style>