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

	// Break down path into breadcrumb parts for display
	$: pathParts = filename.split('/');
	$: folderPath = pathParts.slice(0, -1);
	$: fileName = pathParts[pathParts.length - 1].replace(/\.md$/, '');
</script>

<div class="editor-container">
	<div class="editor-header">
		<div class="filename-section">
			{#if editingFilename}
				<div class="breadcrumb-edit">
					<svg class="edit-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M4 2H9L12 5V13C12 13.5523 11.5523 14 11 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
						<path d="M9 2V5H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					<input
						bind:this={filenameInput}
						type="text"
						class="filename-input"
						value={displayFilename}
						on:blur={finishEditingFilename}
						on:keydown={handleFilenameKeydown}
					/>
				</div>
			{:else}
				<button class="breadcrumb-container" on:click={startEditingFilename} title="Click to rename">
					{#if folderPath.length > 0}
						<svg class="folder-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M2 4C2 3.44772 2.44772 3 3 3H6L7 5H13C13.5523 5 14 5.44772 14 6V12C14 12.5523 13.5523 13 13 13H3C2.44772 13 2 12.5523 2 12V4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
						</svg>
						<span class="folder-path">{folderPath.join('/')}</span>
						<svg class="separator" width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					{/if}
					<svg class="file-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M4 2H9L12 5V13C12 13.5523 11.5523 14 11 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
						<path d="M9 2V5H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					<span class="file-name">{fileName}</span>
				</button>
			{/if}
		</div>
	</div>

	<div class="paper-wrapper">
		<textarea
			bind:this={textareaElement}
			bind:value={content}
			on:input={handleInput}
			class="editor-textarea"
			placeholder="Start writing..."
			spellcheck="true"
		></textarea>
	</div>

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
		background: #f5f5f5;
	}

	.editor-header {
		display: flex;
		justify-content: flex-start;
		align-items: center;
		padding: 0.75rem 2rem 0.75rem 2rem;
		border-bottom: 1px solid #ddd;
	}

	.filename-section {
		flex: 1;
		display: flex;
		align-items: center;
	}

	.breadcrumb-container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: rgba(0, 0, 0, 0.02);
		border: 1px solid rgba(0, 0, 0, 0.06);
		font-size: 0.8125rem;
		font-weight: 500;
		color: #1a1a1a;
		cursor: pointer;
		padding: 0.5rem 0.75rem;
		border-radius: 0;
		transition: all 0.15s ease;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.breadcrumb-container:hover {
		background: rgba(0, 0, 0, 0.04);
		border-color: rgba(0, 0, 0, 0.12);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	.folder-icon,
	.file-icon {
		color: #666;
		flex-shrink: 0;
	}

	.folder-icon {
		color: #8b7355;
	}

	.file-icon {
		color: #3b82f6;
	}

	.folder-path {
		color: #666;
		font-size: 0.8125rem;
	}

	.separator {
		color: #999;
		flex-shrink: 0;
	}

	.file-name {
		color: #1a1a1a;
		font-weight: 600;
	}

	.breadcrumb-edit {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: white;
		border: 2px solid #3b82f6;
		padding: 0.5rem 0.75rem;
		border-radius: 0;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.edit-icon {
		color: #3b82f6;
		flex-shrink: 0;
	}

	.filename-input {
		font-size: 0.8125rem;
		font-weight: 500;
		color: #1a1a1a;
		padding: 0;
		border: none;
		outline: none;
		min-width: 200px;
		background: transparent;
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

	.paper-wrapper {
		flex: 1;
		display: flex;
		justify-content: center;
		padding: 0 2rem 0 2rem;
		overflow-y: auto;
	}

	.editor-textarea {
		flex: 1;
		width: 100%;
		max-width: calc(75ch + 20rem);
		padding: 3rem 10rem;
		border: none;
		outline: none;
		background: white;
		font-family: 'Monaspace Xenon', 'Monaco', 'Courier New', monospace;
		font-size: 1rem;
		line-height: 2;
		color: #1a1a1a;
		resize: none;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
		height: fit-content;
		min-height: 100%;
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
