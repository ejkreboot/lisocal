<script lang="ts">
	import type { DirectoryNode, FileMetadata } from './storage';
	import { moveFile, isDirectoryEmpty } from './storage';

	export let node: DirectoryNode;
	export let depth: number = 0;
	export let currentFile: string | null;
	export let expandedDirs: Set<string>;
	export let onFileClick: (node: DirectoryNode) => void;
	export let onDelete: (file: FileMetadata, event: Event) => void;
	export let onDeleteFolder: (path: string, event: Event) => void;
	export let userId: string;
	export let onMoveComplete: () => void;

	$: isExpanded = expandedDirs.has(node.path);
	$: isActive = !node.isDirectory && node.file && currentFile === node.file.path;

	let isDragOver = false;
	let isDragging = false;
	let isFolderEmpty = false;
	let checkingEmpty = false;

	// Check if folder is empty when hovering over delete button
	async function checkFolderEmpty() {
		if (!node.isDirectory || checkingEmpty) return;
		checkingEmpty = true;
		isFolderEmpty = await isDirectoryEmpty(userId, node.path);
		checkingEmpty = false;
	}

	function getDisplayName(name: string): string {
		return name.replace(/\.md$/, '');
	}

	// Drag handlers for files
	function handleDragStart(event: DragEvent) {
		if (node.isDirectory || !node.file) return;
		
		isDragging = true;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', node.file.path);
		}
	}

	function handleDragEnd() {
		isDragging = false;
	}

	// Drop handlers for folders
	function handleDragOver(event: DragEvent) {
		if (!node.isDirectory) return;
		
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
		isDragOver = true;
	}

	function handleDragLeave() {
		isDragOver = false;
	}

	async function handleDrop(event: DragEvent) {
		if (!node.isDirectory) return;
		
		event.preventDefault();
		isDragOver = false;

		const draggedFilePath = event.dataTransfer?.getData('text/plain');
		if (!draggedFilePath) return;

		// Get the relative path (without userId)
		const relativePath = draggedFilePath.replace(`${userId}/`, '');
		const filename = relativePath.split('/').pop();
		
		// Don't drop into itself
		if (relativePath.startsWith(node.path + '/')) return;

		// Construct new path
		const newRelativePath = `${node.path}/${filename}`;
		const newFullPath = `${userId}/${newRelativePath}`;

		// Don't move if it's already there
		if (draggedFilePath === newFullPath) return;

		// Perform the move
		const success = await moveFile(draggedFilePath, newFullPath);
		
		if (success) {
			// Trigger refresh
			onMoveComplete();
		}
	}
</script>

<div class="tree-item" style="padding-left: {depth === 0 ? 0.5 : depth * 1.25}rem;">
	<div
		class="file-item"
		class:active={isActive}
		class:directory={node.isDirectory}
		class:drag-over={isDragOver}
		class:dragging={isDragging}
		on:click={() => onFileClick(node)}
		role="button"
		tabindex="0"
		on:keydown={(e) => e.key === 'Enter' && onFileClick(node)}
		draggable={!node.isDirectory}
		on:dragstart={handleDragStart}
		on:dragend={handleDragEnd}
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:drop={handleDrop}
	>
		{#if node.isDirectory}
			<svg class="chevron" class:expanded={isExpanded} width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			<svg class="folder-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M2 4C2 3.44772 2.44772 3 3 3H6L7 5H13C13.5523 5 14 5.44772 14 6V12C14 12.5523 13.5523 13 13 13H3C2.44772 13 2 12.5523 2 12V4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
			</svg>
		{:else}
			<svg class="file-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M4 2H9L12 5V13C12 13.5523 11.5523 14 11 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
				<path d="M9 2V5H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		{/if}
		<span class="file-name">{getDisplayName(node.name)}</span>
		{#if !node.isDirectory && node.file}
			<button
				class="delete-btn"
				on:click={(e) => node.file && onDelete(node.file, e)}
				title="Delete"
			>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12V13C12 13.5523 11.5523 14 11 14H5C4.44772 14 4 13.5523 4 13V4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
		{:else if node.isDirectory}
			<button
				class="delete-btn folder-delete"
				class:disabled={!isFolderEmpty && checkingEmpty === false}
				on:mouseenter={checkFolderEmpty}
				on:click={(e) => isFolderEmpty && onDeleteFolder(node.path, e)}
				title={isFolderEmpty ? 'Delete folder' : 'Only empty folders can be deleted'}
				disabled={!isFolderEmpty && checkingEmpty === false}
			>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12V13C12 13.5523 11.5523 14 11 14H5C4.44772 14 4 13.5523 4 13V4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
		{/if}
	</div>

	{#if node.isDirectory && isExpanded && node.children}
		{#each node.children as child}
			<svelte:self
				node={child}
				depth={depth + 1}
				{currentFile}
				{expandedDirs}
				{onFileClick}
				{onDelete}
				{onDeleteFolder}
				{userId}
				{onMoveComplete}
			/>
		{/each}
	{/if}
</div>

<style>
	.tree-item {
		margin: 0;
	}

	.file-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.5rem;
		margin: 0;
		background: transparent;
		border-radius: 0;
		cursor: pointer;
		transition: background 0.15s;
		border: none;
		font-size: 0.8125rem;
	}

	.file-item:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.file-item.active {
		background: rgba(0, 0, 0, 0.08);
		font-weight: 500;
	}

	.file-item.directory {
		font-weight: 500;
		color: #333;
	}

	.chevron {
		flex-shrink: 0;
		color: #666;
		transition: transform 0.2s;
		transform: rotate(0deg);
	}

	.chevron.expanded {
		transform: rotate(90deg);
	}

	.folder-icon,
	.file-icon {
		flex-shrink: 0;
		color: #666;
	}

	.file-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #1a1a1a;
	}

	.delete-btn {
		opacity: 0;
		padding: 0.25rem;
		background: none;
		border: none;
		color: #999;
		cursor: pointer;
		transition: all 0.15s;
		border-radius: 0;
		flex-shrink: 0;
	}

	.file-item:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		background: rgba(0, 0, 0, 0.1);
		color: #333;
	}

	.delete-btn.disabled,
	.delete-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.delete-btn.disabled:hover,
	.delete-btn:disabled:hover {
		background: none;
		color: #999;
	}

	.file-item.dragging {
		opacity: 0.5;
		cursor: move;
	}

	.file-item.drag-over {
		background: rgba(59, 130, 246, 0.1);
		border: 2px dashed rgba(59, 130, 246, 0.5);
		margin: -2px;
	}

	.file-item:not(.directory) {
		cursor: grab;
	}

	.file-item:not(.directory):active {
		cursor: grabbing;
	}
</style>
