<script lang="ts">
  import type { TransportType } from '../types/page';
  import { transportIcons } from '../icons/transport';

  let {
    type,
    size = 18,
    class: className = '',
    ariaLabel,
  }: {
    type: TransportType;
    size?: number;
    class?: string;
    ariaLabel?: string;
  } = $props();

  let icon = $derived(transportIcons[type] ?? transportIcons.bus);
  let classes = $derived(['transport-icon', className].filter(Boolean).join(' '));
</script>

<svg
  class={classes}
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="currentColor"
  focusable="false"
  aria-hidden={ariaLabel ? undefined : 'true'}
  aria-label={ariaLabel || undefined}
  role={ariaLabel ? 'img' : undefined}
>
  <g transform={icon.transform}>
    {@html icon.body}
  </g>
</svg>

<style>
  .transport-icon {
    display: block;
    flex-shrink: 0;
  }
</style>
