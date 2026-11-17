<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import { tick } from 'svelte';
  import Sheet from './Sheet.svelte';
  import { getT } from '../stores/localeStore.svelte';

  let { load, onClose, children, contained = false }: {
    load: () => Promise<{ default: Component<any> }>;
    onClose: () => void;
    contained?: boolean;
    children: Snippet<[Component<any>]>;
  } = $props();
  let t = $derived(getT());
  let attempt = $state(0);
  let handingOver = $state(false);
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  async function loadSurface() {
    const loaded = await load();
    handingOver = true;
    await tick();
    if (!contained && trigger?.isConnected) trigger.focus({ preventScroll: true });
    return loaded;
  }
  let module = $derived.by(() => { attempt; return loadSurface(); });
</script>

{#await module}
  {#if contained}
    <p role="status">{t.loading}</p>
  {:else}
  <Sheet isOpen={!handingOver} onClose={() => { onClose(); trigger?.focus(); }} restoreFocusOnClose={false} title={t.loading} closeAriaLabel={t.closeAdd}>
    <p role="status">{t.loading}</p>
  </Sheet>
  {/if}
{:then loaded}
  {@render children(loaded.default)}
{:catch}
  {#if contained}
    <p role="alert">{t.errorDefault}</p>
    <button onclick={() => attempt += 1}>{t.retry}</button>
  {:else}
  <Sheet isOpen={true} {onClose} title={t.errorTitle} closeAriaLabel={t.closeAdd}>
    <p role="alert">{t.errorDefault}</p>
    <button onclick={() => attempt += 1}>{t.retry}</button>
  </Sheet>
  {/if}
{/await}
