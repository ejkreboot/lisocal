<script lang="ts">
	import type { FileMetadata, DirectoryNode } from './storage';
	import { deleteFile, buildDirectoryTree } from './storage';
	import TreeNode from './TreeNode.svelte';

	export let files: FileMetadata[];
	export let currentFile: string | null;
	export let onFileSelect: (relativePath: string) => void;
	export let onNewFile: () => void;
	export let onNewFolder: () => void;
	export let userId: string;

	let deletingFile: string | null = null;
	let expandedDirs = new Set<string>();

	// Build directory tree from files
	$: tree = buildDirectoryTree(files, userId);

	function handleFileClick(node: DirectoryNode) {
		if (node.isDirectory) {
			toggleDirectory(node.path);
		} else if (node.file) {
			// Pass the relative path (path without userId prefix)
			const relativePath = node.file.path.replace(`${userId}/`, '');
			onFileSelect(relativePath);
		}
	}

	function toggleDirectory(path: string) {
		if (expandedDirs.has(path)) {
			expandedDirs.delete(path);
		} else {
			expandedDirs.add(path);
		}
		expandedDirs = expandedDirs; // Trigger reactivity
	}

	function handleDelete(file: FileMetadata, event: Event) {
		event.stopPropagation();
		deletingFile = file.path;
	}

	async function confirmDelete(path: string) {
		const success = await deleteFile(path);
		
		if (success) {
			// Remove from list (parent will refresh)
			files = files.filter(f => f.path !== path);
		}
		
		deletingFile = null;
	}

	function cancelDelete() {
		deletingFile = null;
	}
</script>

<div class="file-browser">
	<div class="browser-header">
		<h2>Your Writings</h2>
	</div>
	
	<div class="action-buttons">
		<button class="new-file-btn" on:click={onNewFile}>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			</svg>
			New File
		</button>
		<button class="new-folder-btn" on:click={onNewFolder}>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M2 4C2 3.44772 2.44772 3 3 3H6L7 5H13C13.5523 5 14 5.44772 14 6V12C14 12.5523 13.5523 13 13 13H3C2.44772 13 2 12.5523 2 12V4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
				<path d="M8 8V11M6.5 9.5H9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			</svg>
			New Folder
		</button>
	</div>

	<div class="file-list">
		{#if files.length === 0}
			<div class="empty-state">
				<p>No writings yet.</p>
				<p class="empty-hint">Click "New" to start writing.</p>
			</div>
		{:else}
			{#each tree as node}
				<TreeNode
					{node}
					depth={0}
					{currentFile}
					{expandedDirs}
					onFileClick={handleFileClick}
					onDelete={handleDelete}
				/>
			{/each}
		{/if}
	</div>
</div>

{#if deletingFile}
	<div 
		class="delete-modal-overlay" 
		on:click={cancelDelete}
		on:keydown={(e) => e.key === 'Escape' && cancelDelete()}
		role="button"
		tabindex="0"
	>
		<div 
			class="delete-modal" 
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<h3>Delete this file?</h3>
			<p>{deletingFile.replace(`${userId}/`, '').replace(/\.md$/, '')}</p>
			<p class="delete-warning">This action cannot be undone.</p>
			<div class="delete-actions">
				<button class="cancel-btn" on:click={cancelDelete}>Cancel</button>
				<button
					class="confirm-delete-btn"
					on:click={() => deletingFile && confirmDelete(deletingFile)}
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.file-browser {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #f5f5f5;
		border-right: 1px solid #e5e5e5;
	}

	.browser-header {
		display: flex;
		align-items: center;
		padding: 1.25rem 1rem 1rem 1rem;
		border-bottom: 1px solid #ddd;
	}

	.browser-header h2 {
		font-size: 0.875rem;
		font-weight: 600;
		color: #333;
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
	}

	.new-file-btn,
	.new-folder-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		flex: 1;
		padding: 0.625rem 0.5rem;
		background: #333;
		color: white;
		border: none;
		border-radius: 0;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.new-file-btn:hover,
	.new-folder-btn:hover {
		background: #000;
	}

	.file-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem 0.5rem 0.5rem 0;
	}

	.empty-state {
		text-align: center;
		padding: 2rem 1rem;
		color: #666;
	}

	.empty-state p {
		margin: 0.5rem 0;
	}

	.empty-hint {
		font-size: 0.875rem;
		color: #999;
	}

	.delete-modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}

	.delete-modal {
		background: white;
		padding: 1.5rem;
		border-radius: 0;
		max-width: 400px;
		width: 90%;
		border: 1px solid #ddd;
	}

	.delete-modal h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.125rem;
		color: #1a1a1a;
	}

	.delete-modal p {
		margin: 0.25rem 0;
		color: #666;
	}

	.delete-warning {
		color: #333;
		font-size: 0.875rem;
		margin-top: 0.75rem !important;
		font-weight: 600;
	}

	.delete-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}

	.cancel-btn,
	.confirm-delete-btn {
		flex: 1;
		padding: 0.625rem;
		border: 1px solid #ddd;
		border-radius: 0;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.cancel-btn {
		background: white;
		color: #666;
	}

	.cancel-btn:hover {
		background: #f5f5f5;
	}

	.confirm-delete-btn {
		background: #333;
		color: white;
		border-color: #333;
	}

	.confirm-delete-btn:hover {
		background: #000;
		border-color: #000;
	}
</style>
