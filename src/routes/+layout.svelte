<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css'; // Tailwind + global styles
  import favicon from '$lib/assets/favicon.svg';
  import { initFacebookPixel } from '$lib/facebook-pixel';
  import { env } from '$env/dynamic/public';

  // Initialize Facebook Pixel when app loads
  onMount(() => {
    const pixelId = env.PUBLIC_FB_PIXEL_ID;
    console.log('[Layout] PUBLIC_FB_PIXEL_ID from env:', pixelId);

    if (pixelId) {
      initFacebookPixel(pixelId);
    } else {
      console.warn('[Layout] Facebook Pixel ID not found in environment variables');
    }
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<slot />
