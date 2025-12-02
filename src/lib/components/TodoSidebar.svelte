<script lang="ts">
	import { supabase } from '$lib/supabase.js';
	import { scale } from 'svelte/transition';
	import { quintOut, quintIn } from 'svelte/easing';

	// Custom fadeFlow transition to match your signature animation
	function fadeFlowIn(node: HTMLElement, { duration = 250 } = {}) {
		return {
			duration,
			easing: (t: number) => t * (2 - t), // cubic-bezier approximation
			css: (t: number) => {
				const scale = 0.75 + 0.25 * t;
				const blur = 12 * (1 - t);
				const y = 12 * (1 - t);
				return `
                    opacity: ${t};
                    transform: translateY(${y}px) scale(${scale});
                    filter: blur(${blur}px);
                `;
			}
		};
	}

	function fadeFlowOut(node: HTMLElement, { duration = 300 } = {}) {
		return {
			duration,
			easing: (t: number) => t * t, // ease-in
			css: (t: number) => {
				const scale = 0.75 + 0.25 * t;
				const blur = 12 * (1 - t);
				const y = 12 * (1 - t);
				return `
                    opacity: ${t};
                    transform: translateY(${y}px) scale(${scale});
                    filter: blur(${blur}px);
                `;
			}
		};
	}

	let {
		canEdit = true,
		calendarId,
		shareToken = null
	}: {
		canEdit?: boolean;
		calendarId: string;
		shareToken?: string | null;
	} = $props();

	let todos: any[] = $state([]);
	let loading = $state(false);
	let removingTodoIds: Set<string> = $state(new Set());

	// Expose function to create a todo and add it to Best Steps
	export async function createTodoInBestSteps() {
		if (!canEdit || !calendarId) return;

		try {
			const params = shareToken ? `?shareToken=${shareToken}` : '';
			const authToken = shareToken ? null : await getAuthToken();
			const today = new Date().toISOString().split('T')[0];

			const response = await fetch(`/api/todos${params}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(shareToken ? {} : { Authorization: `Bearer ${authToken}` })
				},
				body: JSON.stringify({
					calendarId,
					text: 'New action',
					dailyPriority: true,
					priorityDate: today
				})
			});

			if (!response.ok) {
				throw new Error('Failed to create todo');
			}

			const data = await response.json();
			todos = [data.todo, ...todos];
			
			// Open the new todo in edit mode
			setTimeout(() => {
				startEdit(data.todo.id, data.todo.text);
			}, 0);
		} catch (error) {
			console.error('Error creating todo in best steps:', error);
		}
	}

	let newTodoText = $state('');
	let editingId: string | null = $state(null);
	let editText = $state('');
	let draggedTodo: any = $state(null);
	let draggedTodoId: string | null = $state(null);
	let dragOverIndex = $state(-1);
	let dragOverSection: 'incomplete' | 'completed' | 'best-steps' | null = $state(null);
	let dragOverBestSteps = $state(false);

	// Tooltip state
	let tooltip = $state({
		visible: false,
		text: '',
		x: 0,
		y: 0
	});

	// Load todos when calendarId changes
	$effect(() => {
		if (calendarId) {
			loadTodos();
		}
	});

	async function loadTodos() {
		if (!calendarId) return;

		loading = true;
		try {
			const params = new URLSearchParams({ calendarId });
			if (shareToken) params.append('shareToken', shareToken);

			const response = await fetch(`/api/todos?${params}`, {
				headers: shareToken
					? {}
					: {
							Authorization: `Bearer ${await getAuthToken()}`
						}
			});

			if (!response.ok) {
				throw new Error('Failed to load todos');
			}

			const data = await response.json();
			todos = data.todos || [];
			
			// Clean up old daily priorities
			await cleanupOldDailyPriorities();
		} catch (error) {
			console.error('Error loading todos:', error);
			todos = [];
		} finally {
			loading = false;
		}
	}



	async function getAuthToken() {
		const {
			data: { session }
		} = await supabase.auth.getSession();
		return session?.access_token || '';
	}

	async function cleanupOldDailyPriorities() {
		if (!canEdit || !calendarId) return;

		const today = new Date().toISOString().split('T')[0];
		const outdatedTodos = todos.filter(todo => 
			todo.daily_priority && 
			todo.priority_date && 
			todo.priority_date < today
		);

		if (outdatedTodos.length === 0) return;

		for (const todo of outdatedTodos) {
			try {
				const params = new URLSearchParams({ todoId: todo.id });
				if (shareToken) params.append('shareToken', shareToken);

				const response = await fetch(`/api/todos?${params}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						...(shareToken ? {} : { Authorization: `Bearer ${await getAuthToken()}` })
					},
					body: JSON.stringify({
						dailyPriority: false,
						priorityDate: null
					})
				});

				if (response.ok) {
					todos = todos.map(t => 
						t.id === todo.id 
							? { ...t, daily_priority: false, priority_date: null }
							: t
					);
				}
			} catch (error) {
				console.error('Error cleaning up old daily priority:', error);
			}
		}
	}

	async function addToBestSteps(todoId: string) {
		if (!canEdit || !calendarId) return;

		const today = new Date().toISOString().split('T')[0];

		try {
			const params = new URLSearchParams({ todoId });
			if (shareToken) params.append('shareToken', shareToken);

			const response = await fetch(`/api/todos?${params}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...(shareToken ? {} : { Authorization: `Bearer ${await getAuthToken()}` })
				},
				body: JSON.stringify({
					dailyPriority: true,
					priorityDate: today
				})
			});

			if (response.ok) {
				todos = todos.map(t => 
					t.id === todoId 
						? { ...t, daily_priority: true, priority_date: today }
						: t
				);
			}
		} catch (error) {
			console.error('Error adding to best steps:', error);
		}
	}

	async function removeFromBestSteps(todoId: string) {
		if (!canEdit || !calendarId) return;

		try {
			const params = new URLSearchParams({ todoId });
			if (shareToken) params.append('shareToken', shareToken);

			const response = await fetch(`/api/todos?${params}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...(shareToken ? {} : { Authorization: `Bearer ${await getAuthToken()}` })
				},
				body: JSON.stringify({
					dailyPriority: false,
					priorityDate: null
				})
			});

			if (response.ok) {
				todos = todos.map(t => 
					t.id === todoId 
						? { ...t, daily_priority: false, priority_date: null }
						: t
				);
			}
		} catch (error) {
			console.error('Error removing from best steps:', error);
		}
	}

	async function addTodo() {
		if (!newTodoText.trim() || !canEdit || !calendarId) return;

		try {
			const params = shareToken ? `?shareToken=${shareToken}` : '';
			const authToken = shareToken ? null : await getAuthToken();

			const response = await fetch(`/api/todos${params}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(shareToken ? {} : { Authorization: `Bearer ${authToken}` })
				},
				body: JSON.stringify({
					calendarId,
					text: newTodoText.trim()
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Server error:', response.status, errorText);
				throw new Error(`Failed to create todo: ${response.status} ${errorText}`);
			}

			const data = await response.json();
			todos = [data.todo, ...todos];
			newTodoText = '';
		} catch (error) {
			console.error('Error creating todo:', error);
		}
	}

	async function toggleTodo(id: string) {
		if (!canEdit) return;

		const todo = todos.find((t) => t.id === id);
		if (!todo) return;

		// Add immediate visual feedback
		const todoElement = document.querySelector(`[data-todo-id="${id}"]`);
		if (todoElement) {
			todoElement.classList.add('checking');
		}

		try {
			const params = new URLSearchParams({ todoId: id });
			if (shareToken) params.append('shareToken', shareToken);

			const response = await fetch(`/api/todos?${params}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...(shareToken ? {} : { Authorization: `Bearer ${await getAuthToken()}` })
				},
				body: JSON.stringify({
					completed: !todo.completed
				})
			});

			if (!response.ok) {
				throw new Error('Failed to update todo');
			}

			// Small delay to let check animation complete
			setTimeout(() => {
				todos = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
			}, 150);
		} catch (error) {
			console.error('Error toggling todo:', error);
			// Remove visual feedback if error
			if (todoElement) {
				todoElement.classList.remove('checking');
			}
		}
	}

	async function deleteTodo(id: string) {
		if (!canEdit) return;

		// Mark as removing to trigger exit animation
		removingTodoIds.add(id);

		try {
			const params = new URLSearchParams({ todoId: id });
			if (shareToken) params.append('shareToken', shareToken);

			const response = await fetch(`/api/todos?${params}`, {
				method: 'DELETE',
				headers: shareToken
					? {}
					: {
							Authorization: `Bearer ${await getAuthToken()}`
						}
			});

			if (!response.ok) {
				throw new Error('Failed to delete todo');
			}

			// Remove from state after animation completes
			setTimeout(() => {
				todos = todos.filter((todo) => todo.id !== id);
				removingTodoIds.delete(id);
			}, 350); // slightly longer to ensure animation completes
		} catch (error) {
			console.error('Error deleting todo:', error);
			// Remove from removing set if error
			removingTodoIds.delete(id);
		}
	}

	function startEdit(id: string, text: string) {
		if (!canEdit) return;

		editingId = id;
		editText = text;

		setTimeout(() => {
			const input = document.querySelector('.edit-todo-input') as HTMLInputElement;
			if (input) {
				input.focus();
				input.select();
			}
		}, 0);
	}

	async function saveEdit() {
		if (!editText.trim() || editingId === null) {
			cancelEdit();
			return;
		}

		try {
			const params = new URLSearchParams({ todoId: editingId });
			if (shareToken) params.append('shareToken', shareToken);

			const response = await fetch(`/api/todos?${params}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...(shareToken ? {} : { Authorization: `Bearer ${await getAuthToken()}` })
				},
				body: JSON.stringify({
					text: editText.trim()
				})
			});

			if (!response.ok) {
				throw new Error('Failed to update todo');
			}

			todos = todos.map((todo) =>
				todo.id === editingId ? { ...todo, text: editText.trim() } : todo
			);

			editingId = null;
			editText = '';
		} catch (error) {
			console.error('Error saving todo:', error);
			cancelEdit();
		}
	}

	function cancelEdit() {
		editingId = null;
		editText = '';
	}

	function handleEditKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelEdit();
		}
	}

	function handleNewTodoKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			addTodo();
		}
	}

	// Drag and drop functions
	function handleDragStart(event: DragEvent, todo: any) {
		if (!canEdit || todo.completed) return;

		draggedTodo = todo;
		draggedTodoId = todo.id;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/html', '');
		}
	}

	function handleDragOver(event: DragEvent, index: number) {
		if (!canEdit || !draggedTodo || draggedTodo.completed) return;

		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}

		dragOverIndex = index;
		dragOverSection = 'incomplete';
	}

	function handleBestStepsDragOver(event: DragEvent) {
		if (!canEdit || !draggedTodo || draggedTodo.completed) return;

		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}

		dragOverBestSteps = true;
	}

	function handleBestStepsDragLeave() {
		setTimeout(() => {
			dragOverBestSteps = false;
		}, 50);
	}

	async function handleBestStepsDrop(event: DragEvent) {
		if (!canEdit || !draggedTodo || draggedTodo.completed) return;

		event.preventDefault();

		// Check if we're at the limit (3 best steps)
		if (bestStepsTodos.length >= 3 && !draggedTodo.daily_priority) {
			resetDrag();
			return;
		}

		// If todo is already in best steps, do nothing
		if (draggedTodo.daily_priority) {
			resetDrag();
			return;
		}

		await addToBestSteps(draggedTodo.id);
		resetDrag();
	}

	function handleDragLeave() {
		setTimeout(() => {
			dragOverIndex = -1;
			dragOverSection = null;
		}, 50);
	}

	async function handleDrop(event: DragEvent, targetTodo: any, targetIndex: number) {
		if (!canEdit || !draggedTodo || draggedTodo.completed) return;

		event.preventDefault();

		if (draggedTodo.id === targetTodo.id) {
			resetDrag();
			return;
		}

		const draggedIndex = regularIncompleteTodos.findIndex((t: any) => t.id === draggedTodo.id);

		if (draggedIndex === -1) {
			resetDrag();
			return;
		}

		const newIncompleteList = [...regularIncompleteTodos];
		const [movedItem] = newIncompleteList.splice(draggedIndex, 1);
		newIncompleteList.splice(targetIndex, 0, movedItem);

		todos = [...bestStepsTodos, ...newIncompleteList, ...completedTodos];

		await saveReorder(newIncompleteList.map((t) => t.id));

		resetDrag();
	}

	async function saveReorder(todoIds: string[]) {
		if (!canEdit || !calendarId) return;

		try {
			const params = shareToken ? `?shareToken=${shareToken}` : '';
			const response = await fetch(`/api/todos${params}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...(shareToken ? {} : { Authorization: `Bearer ${await getAuthToken()}` })
				},
				body: JSON.stringify({
					reorderData: {
						todoIds,
						calendarId
					}
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Reorder failed:', errorText);
				throw new Error('Failed to save todo order');
			}
		} catch (error) {
			console.error('Error saving todo order:', error);
		}
	}

	function resetDrag() {
		draggedTodo = null;
		draggedTodoId = null;
		dragOverIndex = -1;
		dragOverSection = null;
		dragOverBestSteps = false;
	}

	function handleDragEnd() {
		resetDrag();
	}

	function showTooltip(event: MouseEvent, text: string) {
		const target = event.currentTarget as HTMLElement;

		// Only show tooltip when the text is actually truncated (overflow with ellipsis)
		if (target && target.scrollWidth > target.clientWidth) {
			const rect = target.getBoundingClientRect();

			tooltip = {
				visible: true,
				text: text,
				x: rect.left,
				y: rect.bottom + 5
			};
		}
	}

	function hideTooltip() {
		tooltip = {
			visible: false,
			text: '',
			x: 0,
			y: 0
		};
	}



	let completedTodos = $derived(todos.filter((t) => t.completed));
	let bestStepsTodos = $derived(todos.filter((t) => !t.completed && t.daily_priority));
	let regularIncompleteTodos = $derived(todos.filter((t) => !t.completed && !t.daily_priority));
</script>

<aside class="todo-sidebar">
	<div class="sidebar-header">
		<h2>To-Do List</h2>
        {#if canEdit}
            <div class="add-todo-input-container">
                <input
                    class="input new-todo-input"
                    bind:value={newTodoText}
                    onkeydown={(e) => {
                        e.stopPropagation();
                        handleNewTodoKeydown(e);
                    }}
                    placeholder="Add a new task..."
                    aria-label="New task description"
                    disabled={loading}
                />

                <button
                    class="btn btn-primary add-todo-button"
                    onclick={addTodo}
                    disabled={!newTodoText.trim() || loading}
                    aria-label="Add task"
                >
                    <span class="material-symbols-outlined">add</span>
                </button>
    		</div>
        {/if}
	</div>

	<div class="sidebar-content">


		<div class="todos-container">
			{#if loading}
				<div class="loading-state">
					<p>Loading...</p>
				</div>
			{:else}
				<!-- Best Steps Section -->
				<div class="best-steps-section"
					class:drag-over={dragOverBestSteps}
					class:has-items={bestStepsTodos.length > 0}
					ondragover={handleBestStepsDragOver}
					ondragleave={handleBestStepsDragLeave}
					ondrop={handleBestStepsDrop}
					role="region"
					aria-label="Best steps priority tasks"
				>
					<h3 class="section-title">
						<span class="material-symbols-outlined best-steps-icon">hiking</span>
						Best Steps ({bestStepsTodos.length}/3)
					</h3>
					{#if bestStepsTodos.length > 0}
						<div class="best-steps-list">
							{#each bestStepsTodos as todo (todo.id)}
								<div
									class="todo-item best-step-item todo-item-enter"
									class:removing={removingTodoIds.has(todo.id)}
									data-todo-id={todo.id}
									role="listitem"
									in:fadeFlowIn={{ duration: 250 }}
									out:fadeFlowOut={{ duration: 300 }}
								>
									<div class="todo-content">
										{#if canEdit}
											<button
												class="todo-checkbox best-step-checkbox"
												onclick={() => toggleTodo(todo.id)}
												aria-label="Mark task as completed: {todo.text}"
											>
												<span class="checkbox-icon">{todo.completed ? '✓' : ''}</span>
											</button>
										{:else}
											<div class="todo-checkbox best-step-checkbox readonly">
												<span class="checkbox-icon">{todo.completed ? '✓' : ''}</span>
											</div>
										{/if}

										{#if editingId === todo.id}
											<input
												class="input edit-todo-input"
												bind:value={editText}
												onkeydown={(e) => {
													e.stopPropagation();
													handleEditKeydown(e);
												}}
												onblur={saveEdit}
											/>
										{:else}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<span
												class="todo-text best-step-text"
												class:editable={canEdit}
												onclick={() => canEdit && startEdit(todo.id, todo.text)}
												onmouseenter={(e) => showTooltip(e, todo.text)}
												onmouseleave={hideTooltip}
												title={canEdit ? 'Click to edit' : ''}
											>
												{todo.text}
											</span>
										{/if}
									</div>

									{#if canEdit}
										<button
											class="remove-from-best-steps"
											onclick={() => removeFromBestSteps(todo.id)}
											title="Remove from Best Steps"
										>
											↓
										</button>
										<button
											class="delete-button"
											onclick={() => deleteTodo(todo.id)}
											aria-label="Delete task: {todo.text}"
											title="Delete task"
										>
											×
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				{#if regularIncompleteTodos.length > 0}
					<div class="todo-section">
						<div class="todos-list">
							{#each regularIncompleteTodos as todo, index (todo.id)}
								<div
									class="todo-item todo-item-enter"
									class:completed={todo.completed}
									class:drag-over={dragOverIndex === index && dragOverSection === 'incomplete'}
									class:draggable={canEdit}
									class:dragging={draggedTodoId === todo.id}
									class:removing={removingTodoIds.has(todo.id)}
									data-todo-id={todo.id}
									draggable={canEdit}
									ondragstart={(e) => handleDragStart(e, todo)}
									ondragover={(e) => handleDragOver(e, index)}
									ondragleave={handleDragLeave}
									ondrop={(e) => handleDrop(e, todo, index)}
									ondragend={handleDragEnd}
									role="listitem"
									in:fadeFlowIn={{ duration: 250 }}
									out:fadeFlowOut={{ duration: 300 }}
								>
									{#if canEdit}
										<div class="drag-handle" title="Drag to reorder">
											<span class="material-symbols-outlined">drag_indicator</span>
										</div>
									{/if}
									<div class="todo-content">
										{#if canEdit}
											<button
												class="todo-checkbox"
												onclick={() => toggleTodo(todo.id)}
												aria-label="Mark task as completed: {todo.text}"
											>
												<span class="checkbox-icon">{todo.completed ? '✓' : ''}</span>
											</button>
										{:else}
											<div class="todo-checkbox readonly">
												<span class="checkbox-icon">{todo.completed ? '✓' : ''}</span>
											</div>
										{/if}

										{#if editingId === todo.id}
											<input
												class="input edit-todo-input"
												bind:value={editText}
												onkeydown={(e) => {
													e.stopPropagation();
													handleEditKeydown(e);
												}}
												onblur={saveEdit}
											/>
										{:else}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<span
												class="todo-text"
												class:editable={canEdit}
												onclick={() => canEdit && startEdit(todo.id, todo.text)}
												onmouseenter={(e) => showTooltip(e, todo.text)}
												onmouseleave={hideTooltip}
												title={canEdit ? 'Click to edit' : ''}
											>
												{todo.text}
											</span>
										{/if}
									</div>

									{#if canEdit}
										<button
											class="delete-button"
											onclick={() => deleteTodo(todo.id)}
											aria-label="Delete task: {todo.text}"
											title="Delete task"
										>
											×
										</button>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if completedTodos.length > 0}
					<div class="todo-section">
						<h3 class="section-title completed-section">Completed ({completedTodos.length})</h3>
						<div class="todos-list">
							{#each completedTodos as todo (todo.id)}
								<div
									class="todo-item completed todo-item-enter"
									role="listitem"
									data-todo-id={todo.id}
									class:removing={removingTodoIds.has(todo.id)}
									in:fadeFlowIn={{ duration: 250 }}
									out:fadeFlowOut={{ duration: 300 }}
								>
									<div class="todo-content">
										{#if canEdit}
											<button
												class="todo-checkbox"
												onclick={() => toggleTodo(todo.id)}
												aria-label="Mark task as incomplete: {todo.text}"
											>
												<span class="checkbox-icon">✓</span>
											</button>
										{:else}
											<div class="todo-checkbox readonly">
												<span class="checkbox-icon">✓</span>
											</div>
										{/if}

										{#if editingId === todo.id}
											<input
												class="input edit-todo-input"
												bind:value={editText}
												onkeydown={(e) => {
													e.stopPropagation();
													handleEditKeydown(e);
												}}
												onblur={saveEdit}
											/>
										{:else}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<span
												class="todo-text completed"
												class:editable={canEdit}
												onclick={() => canEdit && startEdit(todo.id, todo.text)}
												onmouseenter={(e) => showTooltip(e, todo.text)}
												onmouseleave={hideTooltip}
												title={canEdit ? 'Click to edit' : ''}
											>
												{todo.text}
											</span>
										{/if}
									</div>

									{#if canEdit}
										<button
											class="delete-button"
											onclick={() => deleteTodo(todo.id)}
											aria-label="Delete completed task: {todo.text}"
											title="Delete task"
										>
											×
										</button>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if bestStepsTodos.length === 0 && regularIncompleteTodos.length === 0 && completedTodos.length === 0}
					<div class="empty-state">
						<p>No tasks yet!</p>
						{#if canEdit}
							<p class="empty-hint">Add your first task above.</p>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</div>


</aside>

{#if tooltip.visible}
	<div class="tooltip" style="left: {tooltip.x}px; top: {tooltip.y}px;">
		{tooltip.text}
	</div>
{/if}

<style>
	.todo-sidebar {
		background: var(--white);
		border-right: 1px solid var(--gray-200);
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		min-width: 240px;
		max-width: 400px;
	}

	.sidebar-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
		padding: var(--space-5) var(--space-5) var(--space-4);
		border-bottom: 0px solid var(--gray-200);
		flex-shrink: 0;
		min-height: 70px;
		max-height: 70px;
		height: 70px;
	}

	.sidebar-header h2 {
		margin: 0;
		color: var(--dark-text);
		font-size: 18px;
		font-weight: 600;
		font-family: var(--font-primary);
        min-width: 100px;
	}

	.sidebar-content {
		display: flex;
		flex-direction: column;
		flex: 1;
		overflow: hidden;
	}



	.add-todo-input-container {
		display: flex;
		gap: var(--space-2);
		align-items: center;
        margin-top: -3px;
	}

	.new-todo-input {
		flex: 1;
		font-size: 13px;
		padding: var(--space-2) var(--space-3);
		margin: 0;
	}

	.add-todo-button {
		width: 32px;
		height: 32px;
		font-size: 13px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.add-todo-button .material-symbols-outlined {
		font-size: 16px;
	}



	.todos-container {
		overflow-y: auto;
		flex: 1;
		padding: 0 var(--space-5);
	}

	.todo-section {
		margin-bottom: var(--space-5);
	}

	.todo-section:last-child {
		margin-bottom: 0;
	}

	.section-title {
		font-size: 11px;
		font-weight: 600;
		color: var(--gray-600);
		margin: 0 0 var(--space-3);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-family: var(--font-primary);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	
	.section-title .best-steps-icon {
		font-size: 16px;
		color: #ff9800;
		font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20;
	}

	.section-title.completed-section {
		color: var(--gray-700);
	}

	.todos-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.todo-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--gray-200);
		border-radius: var(--radius-small-default);
		background: var(--white);
		transition: all var(--transition-normal);
		font-size: 13px;
	}

	.todo-item:hover {
		border-color: #d0d0d0;
		background: var(--gray-50);
	}

	.todo-item.completed {
		background: var(--gray-50);
		border-color: #e8e9ea;
		color: var(--gray-700);
	}

	/* Animation states */
	.todo-item-enter {
		animation: fadeFlowIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.todo-item.removing {
		animation: fadeFlowOut 0.3s cubic-bezier(0.6, 0, 0.8, 1) forwards;
		pointer-events: none;
	}

	@keyframes fadeFlowIn {
		0% {
			opacity: 0;
			transform: translateY(12px) scale(0.75);
			filter: blur(12px);
		}
		100% {
			opacity: 1;
			transform: translateY(0) scale(1);
			filter: blur(0);
		}
	}

	@keyframes fadeFlowOut {
		100% {
			opacity: 1;
			transform: translateY(0px) scale(1);
			filter: blur(0px);
		}
		0% {
			opacity: 0;
			transform: translateY(12px) scale(0.75);
			filter: blur(12px);
		}
	}

	@keyframes checkBounce {
		0% {
			transform: scale(1);
		}
		30% {
			transform: scale(1.05);
		}
		60% {
			transform: scale(0.98);
		}
		100% {
			transform: scale(1);
		}
	}

	.todo-item.draggable {
		cursor: grab;
	}

	.todo-item.dragging {
		opacity: 0.5;
		transform: scale(1.02);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		cursor: grabbing;
	}

	.todo-item.drag-over {
		border-color: var(--primary-color);
		background: var(--primary-light);
		transform: translateY(-2px);
	}

	.drag-handle {
		display: flex;
		align-items: center;
		color: var(--gray-600);
		cursor: grab;
		flex-shrink: 0;
	}

	.drag-handle:hover {
		color: var(--gray-600);
	}

	.drag-handle .material-symbols-outlined {
		font-size: 16px;
	}

	.todo-content {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
	}

	.todo-checkbox {
		width: 18px;
		height: 18px;
		border: 2px solid var(--gray-600);
		border-radius: var(--radius-small-default);
		background: var(--white);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all var(--transition-normal);
		padding: 0;
		flex-shrink: 0;
	}

	.todo-checkbox:hover {
		border-color: var(--primary-color);
		transform: scale(1.05);
	}

	.todo-checkbox.readonly {
		cursor: default;
		background: var(--gray-100);
	}

	.todo-item.completed .todo-checkbox {
		background: #4caf50;
		border-color: #4caf50;
		animation: checkPop 0.2s ease-out;
	}

	@keyframes checkPop {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	.checkbox-icon {
		font-size: 11px;
		font-weight: bold;
		color: var(--white);
		line-height: 1;
	}

	.todo-text {
		flex: 1;
		font-size: 13px;
		color: var(--dark-text);
		line-height: 1.4;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.todo-text.editable {
		cursor: pointer;
		padding: var(--space-1) var(--space-2);
		margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
		border-radius: var(--radius-small-default);
		transition: background-color var(--transition-normal);
	}

	.todo-text.editable:hover {
		background: rgba(33, 150, 243, 0.1);
	}

	.todo-text.completed {
		text-decoration: line-through;
		color: var(--gray-700);
	}

	.edit-todo-input {
		flex: 1;
		margin: 0;
		padding: var(--space-1) var(--space-2);
		border: 2px solid var(--primary-color);
		font-size: 13px;
	}

	.delete-button {
		background: none;
		border: none;
		color: var(--lighter-text-cool);
		cursor: pointer;
		padding: var(--space-1);
		font-size: 16px;
		font-weight: bold;
		border-radius: var(--radius-small-default);
		transition: all var(--transition-normal);
		flex-shrink: 0;
		line-height: 1;
	}

	.delete-button:hover {
		background: #ffebee;
		color: #f44336;
		transform: scale(1.1);
	}

	.delete-button:active {
		transform: scale(0.95);
	}

	.empty-state {
		text-align: center;
		padding: var(--space-8) var(--space-4);
		color: var(--gray-500);
	}

	.empty-state p {
		margin: 0 0 var(--space-2);
		font-size: 14px;
	}

	.empty-hint {
		font-size: 12px;
		color: var(--gray-400);
	}

	.loading-state {
		text-align: center;
		padding: var(--space-8) var(--space-4);
		color: var(--gray-500);
	}

	.loading-state p {
		margin: 0;
		font-size: 14px;
	}

	.tooltip {
		position: fixed;
		background: var(--gray-800);
		color: var(--white);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-small-default);
		font-size: 12px;
		max-width: 300px;
		word-wrap: break-word;
		z-index: 10000;
		pointer-events: none;
		box-shadow: var(--shadow-lg);
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-5px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Best Steps Section Styles */
	.best-steps-section {
		margin-bottom: var(--space-5);
		padding: var(--space-3);
		border: 0.5px solid #fb923c;
		border-radius: var(--radius-small-default);
		background: #fef3e2;
		transition: all var(--transition-normal);
		position: relative;
	}

	.best-steps-section.has-items {
		padding: var(--space-3);
		background: #fef3e2;
		border-color: #fb923c;
	}

	.best-steps-section.drag-over {
		background: #fed7aa;
		border: 2px dashed #fb923c;
		padding: var(--space-3);
	}

	.best-steps-section.drag-over .section-title::after {
		content: ' - Drop tasks here';
		font-style: italic;
		font-weight: normal;
		color: #c2410c;
	}

	.best-steps-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.best-step-item {
		border-left: 3px solid #fb923c !important;
		background: var(--white) !important;
		border-top: 1px solid #fdba74 !important;
		border-right: 1px solid #fdba74 !important;
		border-bottom: 1px solid #fdba74 !important;
	}

	.best-step-item:hover {
		border-left-color: #ea580c !important;
		background: #fef3e2 !important;
	}

	.best-step-checkbox {
		border-color: #fb923c !important;
	}

	.best-step-text {
		font-weight: 500 !important;
		color: var(--dark-text) !important;
	}

	.remove-from-best-steps {
		background: none;
		border: none;
		color: #fb923c;
		cursor: pointer;
		padding: var(--space-1);
		font-size: 14px;
		font-weight: normal;
		border-radius: var(--radius-small-default);
		transition: all var(--transition-normal);
		flex-shrink: 0;
		line-height: 1;
		margin-right: var(--space-1);
	}

	.remove-from-best-steps:hover {
		background: #fed7aa;
		color: #ea580c;
	}

	.remove-from-best-steps:active {
		transform: scale(0.95);
	}


</style>
