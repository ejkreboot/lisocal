<!-- TodoGoalModal.svelte -->
<script lang="ts">
	interface Goal {
		id: string;
		title: string;
		description: string;
		category: 'health' | 'career' | 'personal' | 'financial' | 'learning' | 'other';
	}

	interface Props {
		isOpen: boolean;
		goals: Goal[];
		selectedGoalId?: string | null;
		selectedPriority?: number;
		isDailyPriority?: boolean;
		onSelect: (goalId: string | null, priority: number, isDailyPriority: boolean) => void;
		onClose: () => void;
	}

	let {
		isOpen = $bindable(),
		goals,
		selectedGoalId = null,
		selectedPriority = 0,
		isDailyPriority = false,
		onSelect,
		onClose
	}: Props = $props();

	let localGoalId = $state(selectedGoalId);
	let localPriority = $state(selectedPriority || 0);
	let localDailyPriority = $state(isDailyPriority || false);

	$effect(() => {
		if (isOpen) {
			localGoalId = selectedGoalId;
			localPriority = selectedPriority || 0;
			localDailyPriority = isDailyPriority || false;
		}
	});

	function handleSave() {
		onSelect(localGoalId, localPriority, localDailyPriority);
		isOpen = false;
	}

	function handleCancel() {
		localGoalId = selectedGoalId;
		localPriority = selectedPriority || 0;
		localDailyPriority = isDailyPriority || false;
		onClose();
		isOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleCancel();
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if isOpen}
	<div class="modal-overlay" onclick={handleCancel} onkeydown={handleKeydown}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>Set Priority & Goal</h3>
				<button class="close-button" onclick={handleCancel} aria-label="Close modal">×</button>
			</div>

			<div class="modal-body">
				<!-- Daily Priority Toggle -->
				<div class="field-group">
					<label class="checkbox-label">
						<input
							type="checkbox"
							bind:checked={localDailyPriority}
							aria-describedby="daily-priority-help"
						/>
						<span class="checkmark"></span>
						<span>Daily Priority</span>
						<span class="daily-priority-icon material-symbols-outlined">star</span>
					</label>
					<p id="daily-priority-help" class="field-help">Mark as a top priority for today</p>
				</div>

				<!-- Priority Level -->
				<div class="field-group">
					<label for="priority-level">Priority Level</label>
					<div class="priority-buttons">
						<button
							type="button"
							class="priority-button"
							class:active={localPriority === 0}
							onclick={() => (localPriority = 0)}
							aria-label="No priority"
						>
							None
						</button>
						{#each [1, 2, 3] as level}
							<button
								type="button"
								class="priority-button"
								class:active={localPriority === level}
								onclick={() => (localPriority = level)}
								aria-label="Priority level {level}"
								title="Priority Level {level}"
							>
								{#each Array(level) as _}
									<span class="priority-dot">●</span>
								{/each}
							</button>
						{/each}
					</div>
				</div>

				<!-- Goal Selection -->
				<div class="field-group">
					<label for="goal-select">Connect to Goal (Optional)</label>
					<select id="goal-select" bind:value={localGoalId}>
						<option value={null}>No Goal</option>
						{#each goals as goal}
							<option value={goal.id}>{goal.title}</option>
						{/each}
					</select>
				</div>

				{#if localGoalId}
					{@const selectedGoal = goals.find((g) => g.id === localGoalId)}
					{#if selectedGoal}
						<div class="goal-preview">
							<span 
								class="goal-indicator-preview"
								class:category-health={selectedGoal.category === 'health'}
								class:category-career={selectedGoal.category === 'career'}
								class:category-personal={selectedGoal.category === 'personal'}
								class:category-financial={selectedGoal.category === 'financial'}
								class:category-learning={selectedGoal.category === 'learning'}
								class:category-other={selectedGoal.category === 'other'}
							>
								{selectedGoal.title.charAt(0).toUpperCase()}
							</span>
							<span class="goal-info">
								<strong>{selectedGoal.title}</strong>
								{#if selectedGoal.description}
									<span class="goal-description">{selectedGoal.description}</span>
								{/if}
							</span>
						</div>
					{/if}
				{/if}
			</div>

			<div class="modal-footer">
				<button class="btn btn-secondary" onclick={handleCancel}>Cancel</button>
				<button class="btn btn-primary" onclick={handleSave}>Apply</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--space-4);
	}

	.modal-content {
		background: white;
		border-radius: var(--radius-large);
		width: 100%;
		max-width: 400px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		border-bottom: 1px solid var(--gray-200);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: var(--dark-text);
	}

	.close-button {
		background: none;
		border: none;
		font-size: 24px;
		color: var(--gray-500);
		cursor: pointer;
		padding: var(--space-1);
		line-height: 1;
		border-radius: var(--radius-small);
	}

	.close-button:hover {
		background: var(--gray-100);
		color: var(--gray-700);
	}

	.modal-body {
		padding: var(--space-4);
	}

	.field-group {
		margin-bottom: var(--space-4);
	}

	.field-group:last-child {
		margin-bottom: 0;
	}

	.field-group label {
		display: block;
		font-weight: 500;
		margin-bottom: var(--space-2);
		color: var(--dark-text);
	}

	.field-help {
		font-size: 12px;
		color: var(--gray-600);
		margin: var(--space-1) 0 0 0;
	}

	.checkbox-label {
		display: flex !important;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
		font-weight: 500;
	}

	.checkbox-label input[type="checkbox"] {
		margin: 0;
	}

	.daily-priority-icon {
		color: #ff9800;
		font-size: 16px;
	}

	.priority-buttons {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.priority-button {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: var(--space-2) var(--space-3);
		border: 2px solid var(--gray-300);
		border-radius: var(--radius-medium);
		background: white;
		cursor: pointer;
		font-size: 12px;
		font-weight: 500;
		color: var(--gray-700);
		transition: all var(--transition-normal);
		min-width: 60px;
		justify-content: center;
	}

	.priority-button:hover {
		border-color: var(--primary-color);
		background: var(--primary-50);
	}

	.priority-button.active {
		border-color: var(--primary-color);
		background: var(--primary-color);
		color: white;
	}

	.priority-dot {
		color: #ff9800;
		font-size: 8px;
		line-height: 1;
	}

	.priority-button.active .priority-dot {
		color: white;
	}

	select {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 2px solid var(--gray-300);
		border-radius: var(--radius-medium);
		font-size: 14px;
		background: white;
	}

	select:focus {
		outline: none;
		border-color: var(--primary-color);
	}

	.goal-preview {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--gray-50);
		border-radius: var(--radius-medium);
		margin-top: var(--space-2);
	}

	.goal-indicator-preview {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		font-size: 12px;
		font-weight: 600;
		color: white;
		text-transform: uppercase;
		line-height: 1;
		flex-shrink: 0;
	}

	/* Goal category colors */
	.goal-indicator-preview.category-health {
		background-color: #4caf50;
	}

	.goal-indicator-preview.category-career {
		background-color: #2196f3;
	}

	.goal-indicator-preview.category-personal {
		background-color: #9c27b0;
	}

	.goal-indicator-preview.category-financial {
		background-color: #ff9800;
	}

	.goal-indicator-preview.category-learning {
		background-color: #607d8b;
	}

	.goal-indicator-preview.category-other {
		background-color: #795548;
	}

	.goal-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		flex: 1;
	}

	.goal-description {
		font-size: 12px;
		color: var(--gray-600);
		font-weight: normal;
	}

	.modal-footer {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-4);
		border-top: 1px solid var(--gray-200);
		justify-content: flex-end;
	}

	.btn {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-medium);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-normal);
		border: none;
	}

	.btn-secondary {
		background: var(--gray-100);
		color: var(--gray-700);
	}

	.btn-secondary:hover {
		background: var(--gray-200);
	}

	.btn-primary {
		background: var(--primary-color);
		color: white;
	}

	.btn-primary:hover {
		background: var(--primary-600);
	}
</style>