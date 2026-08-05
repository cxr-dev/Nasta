<script lang="ts">
  let { 
    width = '100%', 
    height = '20px', 
    borderRadius = '8px' 
  }: { 
    width?: string;
    height?: string;
    borderRadius?: string;
  } = $props();

</script>

<div 
  class="skeleton" 
  aria-hidden="true"
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
    animation: skeleton-shimmer 1.7s ease-in-out infinite;
  }

  @keyframes skeleton-shimmer {
    to { background-position: -200% 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
      opacity: 0.4;
    }
  }
</style>
