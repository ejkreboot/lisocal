<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<title>lisocal - Zero Friction Personal Planner</title>
	<meta name="description" content="A personal calendar application that makes scheduling feel effortless and fun" />
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width,initial-scale=1" />
</svelte:head>


{@render children?.()}
