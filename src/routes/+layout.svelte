<script lang="ts">
	import '@fontsource/monaspace-xenon/latin.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>lisocal - Zero Friction Personal Planner</title>
	<meta name="description" content="A personal calendar application that makes scheduling feel effortless and fun" />
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width,initial-scale=1" />
</svelte:head>

<div class="app-root">
	{@render children?.()}
</div>

<style>
	.app-root {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
</style>
