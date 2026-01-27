<script lang="ts">
	export let onClick: () => void;
</script>

<button class="writing-btn" on:click={onClick} title="Writing">
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
		<path d="M12 20H21M3 20H7M7 20V4M7 20L12 15L17 20M7 4H3M7 4H17M17 4H21M17 4V20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
	</svg>
	<span class="btn-text">Write</span>
</button>

<style>
	.writing-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: 1px solid #d5d5d5;
		border-radius: 6px;
		color: #333;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.writing-btn:hover {
		background: #f5f5f5;
		border-color: #999;
	}

	.writing-btn:active {
		transform: scale(0.98);
	}

	.btn-text {
		display: none;
	}

	@media (min-width: 640px) {
		.btn-text {
			display: inline;
		}
	}
</style>
