<script lang="ts">
  import type { PlatformPosition } from '../types/journey';
  import { getT } from '../stores/localeStore.svelte';

  let { position }: { position: PlatformPosition } = $props();
  let t = $derived(getT());

  function label(pos: PlatformPosition): string {
    if (pos === 'front') return t.journeyPlatformFront;
    if (pos === 'middle') return t.journeyPlatformMiddle;
    return t.journeyPlatformBack;
  }
</script>

<span class="train-pos" data-pos={position}>
  <span class="pos-label">{label(position)}</span>
</span>

<style>
  .train-pos {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .train-pos[data-pos='front']::before,
  .train-pos[data-pos='back']::before,
  .train-pos[data-pos='middle']::before {
    content: '';
    display: inline-block;
    width: 12px;
    height: 2px;
    border-radius: 1px;
    background: currentColor;
  }

  .train-pos[data-pos='front']::before {
    background: currentColor;
    clip-path: polygon(0% 50%, 100% 0%, 100% 100%);
    width: 8px;
    height: 8px;
    transform: rotate(180deg);
  }

  .train-pos[data-pos='back']::before {
    clip-path: polygon(0% 50%, 100% 0%, 100% 100%);
    width: 8px;
    height: 8px;
    transform: rotate(0deg);
  }
</style>
