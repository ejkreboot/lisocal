<script lang="ts">
	import { onMount, onDestroy } from 'svelte'

	let { isOpen = $bindable() } = $props()

	let timeLeft = $state(25 * 60) // 25 minutes in seconds
	let initialTime = $state(25 * 60)
	let isRunning = $state(false)
	let customMinutes = $state(25)
	let showSettings = $state(false)
	let intervalId: ReturnType<typeof setInterval> | null = null

	let minutes = $derived(Math.floor(timeLeft / 60))
	let seconds = $derived(timeLeft % 60)
	let progress = $derived(((initialTime - timeLeft) / initialTime) * 100)

	function startTimer() {
		if (timeLeft <= 0) return
		
		isRunning = true
		intervalId = setInterval(() => {
			timeLeft -= 1
			if (timeLeft <= 0) {
				completeTimer()
			}
		}, 1000)
	}

	function pauseTimer() {
		isRunning = false
		if (intervalId) {
			clearInterval(intervalId)
			intervalId = null
		}
	}

	function resetTimer() {
		pauseTimer()
		timeLeft = initialTime
	}

	function completeTimer() {
		pauseTimer()
		// Timer completed, close overlay
		setTimeout(() => {
			isOpen = false
			resetTimer()
		}, 1000) // Brief delay to show completion
	}

	function setCustomTime() {
		if (customMinutes > 0 && customMinutes <= 120) { // Max 2 hours
			pauseTimer()
			initialTime = customMinutes * 60
			timeLeft = initialTime
			showSettings = false
		}
	}

	function closeTimer() {
		pauseTimer()
		resetTimer()
		isOpen = false
	}

	function handleClose() {
		if (showSettings) {
			showSettings = false
		} else {
			closeTimer()
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (showSettings) {
				showSettings = false
			} else {
				closeTimer()
			}
		} else if (event.key === ' ' || event.code === 'Space') {
			event.preventDefault()
			if (isRunning) {
				pauseTimer()
			} else {
				startTimer()
			}
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			document.addEventListener('keydown', handleKeydown)
		}
	})

	onDestroy(() => {
		if (intervalId) {
			clearInterval(intervalId)
		}
		if (typeof window !== 'undefined') {
			document.removeEventListener('keydown', handleKeydown)
		}
	})

	// Clean up when component is closed
	$effect(() => {
		if (!isOpen) {
			pauseTimer()
		}
	})
</script>

{#if isOpen}
	<div class="pomodoro-overlay">
		<div class="pomodoro-container">
			<!-- Settings Panel (only show when not running) -->
			{#if showSettings && !isRunning}
				<div class="settings-panel">
					<h3>Timer Duration</h3>
					<div class="settings-content">
						<input 
							type="number" 
							bind:value={customMinutes} 
							min="1" 
							max="120" 
							class="time-input"
						/>
						<span class="time-label">minutes</span>
					</div>
					<div class="settings-buttons">
						<button onclick={setCustomTime} class="btn btn-primary btn-sm">Set</button>
						<button onclick={() => showSettings = false} class="btn btn-ghost btn-sm">Cancel</button>
					</div>
				</div>
			{:else}
				<!-- Main Timer Display -->
				<div class="timer-display">
					<div class="time-display">
						<div class="digit">{String(minutes).padStart(2, '0')[0]}</div>
						<div class="digit">{String(minutes).padStart(2, '0')[1]}</div>
						<div class="colon">:</div>
						<div class="digit">{String(seconds).padStart(2, '0')[0]}</div>
						<div class="digit">{String(seconds).padStart(2, '0')[1]}</div>
					</div>
					{#if timeLeft <= 0}
						<div class="completion-message">Complete!</div>
					{/if}
				</div>

				<!-- Progress Circle -->
				<div class="timer-circle">
					<svg class="progress-ring" width="100" height="100">
						<circle
							class="progress-ring-bg"
							cx="50" cy="50" r="42"
							fill="transparent"
							stroke="rgba(120, 160, 120, 0.2)"
							stroke-width="4"
						/>
						<circle
							class="progress-ring-progress"
							cx="50" cy="50" r="42"
							fill="transparent"
							stroke="rgba(120, 160, 120, 0.5)"
							stroke-width="4"
							stroke-linecap="round"
							style="stroke-dasharray: {2 * Math.PI * 42}; stroke-dashoffset: {2 * Math.PI * 42 * (1 - progress / 100)}"
						/>
					</svg>
				</div>

				<!-- Controls -->
				<div class="timer-controls">
					{#if !isRunning}
						<button onclick={startTimer} class="control-btn start-btn" disabled={timeLeft <= 0}>
							<span class="material-symbols-outlined">play_arrow</span>
						</button>
					{:else}
						<button onclick={pauseTimer} class="control-btn pause-btn">
							<span class="material-symbols-outlined">pause</span>
						</button>
					{/if}
					
					<button onclick={resetTimer} class="control-btn reset-btn">
						<span class="material-symbols-outlined">refresh</span>
					</button>
					
					{#if !isRunning}
						<button onclick={() => showSettings = true} class="control-btn settings-btn">
							<span class="material-symbols-outlined">settings</span>
						</button>
					{/if}
				</div>

				<!-- Instructions -->
				<div class="instructions">
					<p>Press <kbd>Space</kbd> to start/pause • <kbd>Esc</kbd> to close</p>
				</div>
			{/if}

			<!-- Close button -->
			<button onclick={handleClose} class="close-timer-btn">
				<span class="material-symbols-outlined">close</span>
			</button>
		</div>
	</div>
{/if}

<style>
	.pomodoro-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg, 
			rgba(200, 240, 200, 0.9) 0%,     /* Very light sage green */
			rgba(220, 245, 220, 0.9) 25%,    /* Pale mint */
			rgba(210, 242, 210, 0.9) 50%,    /* Soft eucalyptus */
			rgba(190, 235, 190, 0.9) 75%,    /* Light sage */
			rgba(205, 238, 205, 0.9) 100%    /* Gentle mint */
		);
		background-size: 400% 400%;
		animation: gentle-morph 20s ease-in-out infinite;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		backdrop-filter: blur(4px);
	}

	@keyframes gentle-morph {
		0% {
			background-position: 0% 50%;
		}
		25% {
			background-position: 100% 25%;
		}
		50% {
			background-position: 50% 100%;
		}
		75% {
			background-position: 25% 0%;
		}
		100% {
			background-position: 0% 50%;
		}
	}

	.pomodoro-container {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-8);
		color: white;
		text-align: center;
		max-width: 90vw;
		max-height: 90vh;
	}

	.close-timer-btn {
		position: absolute;
		top: -40px;
		right: -40px;
		background: transparent;
		border: none;
		color: rgba(80, 140, 80, 0.7);
		width: 40px;
		height: 40px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all var(--transition-normal);
	}

	.close-timer-btn:hover {
		color: rgba(60, 120, 60, 0.9);
		transform: scale(1.1);
	}

	.timer-display {
		text-align: center;
		margin-bottom: 0;
		line-height: 0.8;
	}

	.timer-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: var(--space-4);
		margin-top: -20px;
	}

	.progress-ring {
		transform: rotate(-90deg);
		filter: drop-shadow(0 0 5px rgba(120, 160, 120, 0.1));
	}

	.progress-ring-progress {
		transition: stroke-dashoffset 0.3s ease;
	}

	.time-display {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 240px;
		font-weight: 400;
		font-family: 'Borel', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
		color: rgba(190, 225, 190, 0.25);
		text-shadow: 0 1px 4px rgba(190, 225, 190, 0.08);
	}

	.digit {
		width: 0.52em;
		text-align: center;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.colon {
		width: 0.23em;
		text-align: center;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.completion-message {
		font-size: 14px;
		font-weight: 500;
		opacity: 0.8;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.8; }
		50% { opacity: 1; }
	}

	.timer-controls {
		display: flex;
		gap: var(--space-4);
		align-items: center;
	}

	.control-btn {
		background: transparent;
		border: none;
		color: rgba(80, 140, 80, 0.7);
		width: 50px;
		height: 50px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all var(--transition-normal);
	}

	.control-btn:hover:not(:disabled) {
		color: rgba(60, 120, 60, 0.9);
		transform: scale(1.1);
	}

	.control-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.start-btn:hover:not(:disabled) {
		background: rgba(34, 197, 94, 0.2);
		border-color: rgba(34, 197, 94, 0.4);
	}

	.pause-btn:hover {
		background: rgba(251, 191, 36, 0.2);
		border-color: rgba(251, 191, 36, 0.4);
	}

	.reset-btn:hover {
		background: rgba(239, 68, 68, 0.2);
		border-color: rgba(239, 68, 68, 0.4);
	}

	.settings-btn:hover {
		background: rgba(168, 85, 247, 0.2);
		border-color: rgba(168, 85, 247, 0.4);
	}

	.control-btn .material-symbols-outlined {
		font-size: 24px;
	}

	.instructions {
		color: rgba(80, 140, 80, 0.6);
		font-size: 14px;
		font-weight: 500;
	}

	.instructions kbd {
		background: rgba(80, 140, 80, 0.15);
		border: 1px solid rgba(80, 140, 80, 0.3);
		color: rgba(70, 130, 70, 0.8);
		border-radius: 3px;
		padding: 2px 6px;
		font-size: 12px;
		font-family: monospace;
		font-weight: 600;
	}

	.settings-panel {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		backdrop-filter: blur(8px);
		min-width: 300px;
		color: rgba(80, 140, 80, 0.7);
	}

	.settings-panel h3 {
		margin: 0 0 var(--space-4) 0;
		font-size: 18px;
		font-weight: 600;
		color: rgba(70, 130, 70, 0.8);
	}

	.settings-content {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		justify-content: center;
	}

	.time-input {
		background: rgba(80, 140, 80, 0.08);
		border: 1px solid rgba(80, 140, 80, 0.25);
		color: rgba(70, 130, 70, 0.8);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		width: 80px;
		text-align: center;
		font-size: 16px;
	}

	.time-input:focus {
		outline: none;
		border-color: rgba(80, 140, 80, 0.4);
		background: rgba(80, 140, 80, 0.12);
	}

	.time-input::placeholder {
		color: rgba(80, 140, 80, 0.4);
	}

	.time-label {
		font-size: 14px;
		color: rgba(80, 140, 80, 0.6);
	}

	.settings-buttons {
		display: flex;
		gap: var(--space-3);
		justify-content: center;
	}

	.settings-buttons .btn {
		background: rgba(80, 140, 80, 0.08);
		border: 1px solid rgba(80, 140, 80, 0.25);
		color: rgba(70, 130, 70, 0.8);
		backdrop-filter: blur(8px);
	}

	.settings-buttons .btn:hover {
		background: rgba(80, 140, 80, 0.15);
		border-color: rgba(80, 140, 80, 0.4);
	}

	.settings-buttons .btn-primary {
		background: rgba(80, 140, 80, 0.15);
		border-color: rgba(80, 140, 80, 0.35);
		color: rgba(60, 120, 60, 0.9);
	}

	.settings-buttons .btn-primary:hover {
		background: rgba(80, 140, 80, 0.2);
		border-color: rgba(80, 140, 80, 0.5);
	}

	@media (max-width: 768px) {
		.close-timer-btn {
			top: -30px;
			right: -15px;
		}

		.timer-circle svg {
			width: 80px;
			height: 80px;
		}

		.timer-circle .progress-ring-bg,
		.timer-circle .progress-ring-progress {
			cx: 40;
			cy: 40;
			r: 34;
		}

		.time-display {
			font-size: 160px;
		}

		.digit {
			width: 0.52em;
		}

		.colon {
			width: 0.23em;
		}

		.control-btn {
			width: 45px;
			height: 45px;
		}

		.control-btn .material-symbols-outlined {
			font-size: 20px;
		}

		.settings-panel {
			min-width: 280px;
			padding: var(--space-5);
		}
	}
</style>