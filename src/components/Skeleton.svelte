<script lang="ts">
  import gsap from 'gsap';

  let { 
    width = '100%', 
    height = '20px', 
    borderRadius = '8px' 
  }: { 
    width?: string;
    height?: string;
    borderRadius?: string;
  } = $props();

  let el: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!el) return;
    const tween = gsap.to(el, {
      backgroundPosition: '-200% 0',
      duration: 1.5,
      ease: 'sine.inOut',
      repeat: -1,
    });
    return () => tween.kill();
  });
</script>

<div 
  bind:this={el}
  class="skeleton" 
  style="width: {width}; height: {height}; border-radius: {borderRadius}; background-position: 200% 0;"
></div>

<style>
  .skeleton {
    background: linear-gradient(
      90deg,
      var(--surface) 0%,
      var(--border) 50%,
      var(--surface) 100%
    );
    background-size: 200% 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      opacity: 0.4;
    }
  }
</style>