<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { uploadFile, sanitizeFilePath, moveFile } from './storage';

	export let userId: string;
	export let filename: string;
	export let content: string;
	export let onFilenameChange: (oldName: string, newName: string) => void;

	let saveStatus: 'saved' | 'saving' | 'error' = 'saved';
	let lastSaved: Date | null = null;
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	let editingFilename = false;
	let filenameInput: HTMLInputElement;
	let textareaElement: HTMLTextAreaElement;

	// Autosave logic
	function handleInput() {
		saveStatus = 'saving';
		
		// Clear existing timeout
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}

		// Set new timeout to save after 1 second of inactivity
		saveTimeout = setTimeout(async () => {
			const success = await uploadFile(`${userId}/${filename}`, content);
			
			if (success) {
				saveStatus = 'saved';
				lastSaved = new Date();
			} else {
				saveStatus = 'error';
			}
		}, 1000);
	}

	function startEditingFilename() {
		editingFilename = true;
		setTimeout(() => {
			if (filenameInput) {
				filenameInput.select();
			}
		}, 0);
	}

	async function finishEditingFilename() {
		editingFilename = false;
		
		const newFilename = sanitizeFilePath(filenameInput.value);
		
		if (newFilename !== filename && newFilename) {
			// Move the file in storage
			const success = await moveFile(`${userId}/${filename}`, `${userId}/${newFilename}`);
			
			if (success) {
				onFilenameChange(filename, newFilename);
			} else {
				// Revert on error
				filenameInput.value = filename;
			}
		}
	}

	function handleFilenameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			finishEditingFilename();
		} else if (e.key === 'Escape') {
			editingFilename = false;
			filenameInput.value = filename;
		}
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	onMount(() => {
		// Focus textarea on mount
		if (textareaElement) {
			textareaElement.focus();
		}
	});

	onDestroy(() => {
		// Clear any pending save timeout
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
	});

	// Display the relative path, removing the .md extension from the filename part only
	$: displayFilename = (() => {
		const parts = filename.split('/');
		const lastPart = parts[parts.length - 1];
		parts[parts.length - 1] = lastPart.replace(/\.md$/, '');
		return parts.join('/');
	})();
</script>

<div class="editor-container">
	<div class="editor-header">
		<div class="filename-section">
			{#if editingFilename}
				<input
					bind:this={filenameInput}
					type="text"
					class="filename-input"
					value={displayFilename}
					on:blur={finishEditingFilename}
					on:keydown={handleFilenameKeydown}
				/>
			{:else}
				<button class="filename-display" on:click={startEditingFilename}>
					{displayFilename}
				</button>
			{/if}
		</div>
	</div>

	<textarea
		bind:this={textareaElement}
		bind:value={content}
		on:input={handleInput}
		class="editor-textarea"
		placeholder="Start writing..."
		spellcheck="true"
	></textarea>

	<div class="save-indicator floating">
		{#if saveStatus === 'saving'}
			<span class="status-saving">Saving...</span>
		{:else if saveStatus === 'error'}
			<span class="status-error">Error saving</span>
		{:else if lastSaved}
			<span class="status-saved">Saved {formatTime(lastSaved)}</span>
		{/if}
	</div>
</div>

<style>
	.editor-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #fafafa;
	}

	.editor-header {
		display: flex;
		justify-content: flex-start;
		align-items: center;
		padding: 1.5rem 2rem 1rem 2rem;
		border-bottom: 1px solid #ddd;
	}

	.filename-section {
		flex: 1;
	}

	.filename-display {
		background: none;
		border: none;
		font-size: 1.125rem;
		font-weight: 500;
		color: #333;
		cursor: pointer;
		padding: 0.375rem 0.625rem;
		border-radius: 0;
		transition: background 0.2s;
	}

	.filename-display:hover {
		background: #e5e5e5;
	}

	.filename-input {
		font-size: 1.125rem;
		font-weight: 500;
		color: #333;
		padding: 0.375rem 0.625rem;
		border: 1px solid #666;
		border-radius: 0;
		outline: none;
		min-width: 200px;
	}

	.save-indicator {
		font-size: 0.75rem;
		color: var(--gray-600);
	}

	.save-indicator.floating {
		position: fixed;
		bottom: 1.25rem;
		left: 1.5rem;
		background: var(--gray-50);
		border: 1px solid var(--gray-200);
		padding: 0.35rem 0.6rem;
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-sm);
		pointer-events: none;
	}

	.status-saving {
		color: #666;
	}

	.status-saved {
		color: var(--gray-600);
	}

	.status-error {
		color: #ef4444;
	}

	.editor-textarea {
		flex: 1;
		width: 100%;
		max-width: 65ch;
		margin: 0 auto;
		padding: 2rem;
		border: none;
		outline: none;
		background: transparent;
		font-family: 'Monaspace Xenon', 'Monaco', 'Courier New', monospace;
		font-size: 1rem;
		line-height: 2;
		color: #1a1a1a;
		resize: none;
	}

	.editor-textarea::placeholder {
		color: #999;
	}

	/* For browsers that don't have Monaspace Xenon */
	@supports not (font-family: 'Monaspace Xenon') {
		.editor-textarea {
			font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
		}
	}
</style>
