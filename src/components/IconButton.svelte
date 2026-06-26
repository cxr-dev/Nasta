<script lang="ts">
  let { onclick, ariaLabel, children, class: className = '' }: {
    onclick: () => void;
    ariaLabel: string;
    children?: any;
    class?: string;
  } = $props();
</script>

<button type="button" class="icon-btn {className}" {onclick} aria-label={ariaLabel}>
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .icon-btn {
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    padding: 0;
  }

  .icon-btn:hover {
    background: var(--border);
  }

  @media (min-width: 768px) {
    .icon-btn {
      width: 40px;
      height: 40px;
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.5) inset;
    }

    .icon-btn:hover {
      background: var(--accent-subtle);
    }
  }
</style>
