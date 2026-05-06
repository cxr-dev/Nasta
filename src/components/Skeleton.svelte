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
  style="width: {width}; height: {height}; border-radius: {borderRadius};"
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
    animation: shimmer 1.5s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
      opacity: 0.4;
    }
  }
</style>