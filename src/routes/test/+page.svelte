<script lang="ts">
    import { createRainyDay } from '$lib/rainyday';
    import { onMount } from 'svelte';

    onMount(async () => {
    const image = document.getElementById('test-image') as HTMLImageElement;
    const rain = await createRainyDay({
        image: image,
        blur: 10,
        fps: 100,
        gravityAngleVariance: .05
    });

    rain.trail = rain.TRAIL_SMUDGE;

    rain.rain([[5, 10, 5]], 10);
    });
</script>

<img alt="test" id="test-image" src="/forest-2677257_1920.jpg" />
