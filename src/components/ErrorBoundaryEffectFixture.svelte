<script lang="ts">
  $effect(() => {
    throw new Error('effect failed');
  });
</script>

<button>Effect content</button>
