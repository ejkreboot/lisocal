<script lang="ts">
	import type { DirectoryNode, FileMetadata } from './storage';

	export let node: DirectoryNode;
	export let depth: number = 0;
	export let currentFile: string | null;
	export let expandedDirs: Set<string>;
	export let onFileClick: (node: DirectoryNode) => void;
	export let onDelete: (file: FileMetadata, event: Event) => void;

	$: isExpanded = expandedDirs.has(node.path);
	$: isActive = !node.isDirectory && node.file && currentFile === node.file.path;

	function getDisplayName(name: string): string {
		return name.replace(/\.md$/, '');
	}
</script>

<div class="tree-item" style="padding-left: {depth === 0 ? 0.5 : depth * 1.25}rem;">
	<div
		class="file-item"
		class:active={isActive}
		class:directory={node.isDirectory}
		on:click={() => onFileClick(node)}
		role="button"
		tabindex="0"
		on:keydown={(e) => e.key === 'Enter' && onFileClick(node)}
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
</style>
