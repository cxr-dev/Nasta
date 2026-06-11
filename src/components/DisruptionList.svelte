<script lang="ts">
  let {
    siteDevs,
    t,
  }: {
    siteDevs: { message: string }[];
    t: Record<string, string>;
  } = $props();
</script>

{#if siteDevs.length > 0}
  <div class="disruption-strip">
    <div class="disruption-header">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12" y2="16.01"/>
      </svg>
      <span>{t.disruptions}</span>
    </div>
    <div class="disruption-content">
      {#each siteDevs as dev, i (i)}
        <p>{dev.message}</p>
      {/each}
    </div>
  </div>
{/if}

<style>
  .disruption-strip { padding: 16px; border-top: 1px solid var(--border); background: color-mix(in srgb, #f59e0b 4%, transparent); }
  .disruption-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #f59e0b; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
  .disruption-header svg { width: 18px; height: 18px; }
  .disruption-content { display: flex; flex-direction: column; gap: 12px; }
  .disruption-content p { font-size: 14px; line-height: 1.5; color: var(--text); }
</style>
