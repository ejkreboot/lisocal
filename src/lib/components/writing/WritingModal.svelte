<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import FileBrowser from './FileBrowser.svelte';
	import Editor from './Editor.svelte';
	import {
		listFiles,
		downloadFile,
		uploadFile,
		generateDefaultFilename,
		createDirectory,
		sanitizeDirectoryPath,
		type FileMetadata
	} from './storage';

	export let isOpen = false;
	export let userId: string;

	let files: FileMetadata[] = [];
	let currentFile: { relativePath: string; content: string } | null = null;
	let sidebarVisible = true;
	let loading = true;
	let creatingFolder = false;
	let newFolderPath = '';

	onMount(() => {
		// Load files
		loadFiles().then(() => {
			loading = false;
		});
		
		// Prevent body scroll when modal opens
		document.body.style.overflow = 'hidden';
		
		return () => {
			// Cleanup: restore body scroll
			document.body.style.overflow = '';
		};
	});

	// Watch for isOpen changes to toggle body scroll
	$: {
		if (typeof window !== 'undefined') {
			if (isOpen) {
				document.body.style.overflow = 'hidden';
			} else {
				document.body.style.overflow = '';
			}
		}
	}

	async function loadFiles() {
		files = await listFiles(userId);
		
		// If no files exist, create a default one
		if (files.length === 0 || files.every(f => f.isDirectory)) {
			await createNewFile();
		} else {
			// Open the most recent file (skip directories)
			const firstFile = files.find(f => !f.isDirectory);
			if (firstFile) {
				const relativePath = firstFile.path.replace(`${userId}/`, '');
				await openFile(relativePath);
			}
		}
	}

	async function openFile(relativePath: string) {
		const content = await downloadFile(`${userId}/${relativePath}`);
		
		if (content !== null) {
			currentFile = { relativePath, content };
		}
	}

	async function createNewFile() {
		const filename = generateDefaultFilename(files.filter(f => !f.isDirectory));
		const content = '';
		
		// Create empty file in storage
		await uploadFile(`${userId}/${filename}`, content);
		
		// Add to files list
		files = [
			{
				name: filename,
				path: `${userId}/${filename}`,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				isDirectory: false
			},
			...files
		];
		
		// Open the new file
		currentFile = { relativePath: filename, content };
	}

	function startFolderCreation() {
		creatingFolder = true;
		newFolderPath = '';
	}

	async function confirmCreateFolder() {
		if (!newFolderPath.trim()) {
			creatingFolder = false;
			return;
		}

		const sanitized = sanitizeDirectoryPath(newFolderPath.trim());
		if (!sanitized) {
			creatingFolder = false;
			return;
		}

		const success = await createDirectory(userId, sanitized);
		if (success) {
			// Refresh file list
			await loadFiles();
		}

		creatingFolder = false;
		newFolderPath = '';
	}

	function cancelCreateFolder() {
		creatingFolder = false;
		newFolderPath = '';
	}

	function handleFilenameChange(oldRelativePath: string, newRelativePath: string) {
		// Update the current file
		if (currentFile && currentFile.relativePath === oldRelativePath) {
			currentFile = { ...currentFile, relativePath: newRelativePath };
		}
		
		// Update the files list
		const oldPath = `${userId}/${oldRelativePath}`;
		const newPath = `${userId}/${newRelativePath}`;
		files = files.map(f => 
			f.path === oldPath
				? { ...f, name: newRelativePath.split('/').pop() || newRelativePath, path: newPath }
				: f
		);
	}

	function toggleSidebar() {
		sidebarVisible = !sidebarVisible;
	}

	function close() {
		isOpen = false;
	}

	// Refresh files list when a file is deleted
	$: if (currentFile) {
		const currentPath = `${userId}/${currentFile.relativePath}`;
		if (!files.find(f => f.path === currentPath)) {
			const firstFile = files.find(f => !f.isDirectory);
			if (firstFile) {
				const relativePath = firstFile.path.replace(`${userId}/`, '');
				openFile(relativePath);
			} else {
				currentFile = null;
			}
		}
	}
</script>

{#if isOpen}
	<div 
		class="modal-overlay" 
		transition:fade={{ duration: 200 }}
		on:keydown={(e) => e.key === 'Escape' && close()}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div class="modal-container" on:click|stopPropagation on:keydown|stopPropagation role="presentation">
			<button class="close-btn" on:click={close} title="Close (Esc)">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>

			<div class="modal-content" class:sidebar-hidden={!sidebarVisible}>
				<div class="sidebar">
					<button class="sidebar-toggle" on:click|stopPropagation={toggleSidebar} title="Toggle Sidebar">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M9 4H20C20.5523 4 21 4.44772 21 5V19C21 19.5523 20.5523 20 20 20H9M9 4H4C3.44772 4 3 4.44772 3 5V19C3 19.5523 3.44772 20 4 20H9M9 4V20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
					<FileBrowser
						bind:files
						{userId}
						currentFile={currentFile ? `${userId}/${currentFile.relativePath}` : null}
						onFileSelect={openFile}
						onNewFile={createNewFile}
						onNewFolder={startFolderCreation}
						onRefreshFiles={loadFiles}
					/>
				</div>

				{#if !sidebarVisible}
					<button class="show-sidebar-btn" on:click|stopPropagation={toggleSidebar} title="Show Sidebar">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M9 4H20C20.5523 4 21 4.44772 21 5V19C21 19.5523 20.5523 20 20 20H9M9 4H4C3.44772 4 3 4.44772 3 5V19C3 19.5523 3.44772 20 4 20H9M9 4V20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				{/if}

				<div class="editor-pane" class:sidebar-closed={!sidebarVisible}>
					{#if loading}
						<div class="loading">
							<p>Loading...</p>
						</div>
					{:else if currentFile}
						<Editor
							{userId}
							filename={currentFile.relativePath}
							bind:content={currentFile.content}
							onFilenameChange={handleFilenameChange}
						/>
					{:else}
						<div class="empty-editor">
							<p>No file selected</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	{#if creatingFolder}
		<div 
			class="folder-modal-overlay" 
			on:click={cancelCreateFolder}
			on:keydown={(e) => e.key === 'Escape' && cancelCreateFolder()}
			role="button"
			tabindex="0"
		>
			<div 
				class="folder-modal" 
				on:click|stopPropagation
				on:keydown|stopPropagation
				role="dialog"
				aria-modal="true"
				tabindex="-1"
			>
				<h3>Create New Folder</h3>
				<p class="folder-hint">You can use / to create nested folders (e.g., "notes/2026")</p>
				<input
					type="text"
					class="folder-input"
					bind:value={newFolderPath}
					placeholder="folder-name"
					on:keydown={(e) => {
						if (e.key === 'Enter') confirmCreateFolder();
						if (e.key === 'Escape') cancelCreateFolder();
					}}
				/>
				<div class="folder-actions">
					<button class="cancel-btn" on:click={cancelCreateFolder}>Cancel</button>
					<button class="create-btn" on:click={confirmCreateFolder}>Create</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	:global(body:has(.modal-overlay)) {
		overflow: hidden;
		height: 100vh;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.6);
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		overflow: hidden;
	}

	.modal-container {
		position: relative;
		width: 100%;
		height: 100%;
		max-width: 100vw;
		max-height: 100vh;
		background: white;
		border-radius: 0;
		overflow: hidden;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
	}

	.close-btn {
		position: absolute;
		top: 0.7rem;
		right: 1.25rem;
		z-index: 10;
		padding: 0.2rem  0.2rem  0rem  0.2rem;
		background: white;
		border: 1px solid #ddd;
		border-radius: 0;
		color: #666;
		cursor: pointer;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: #f5f5f5;
		color: #333;
	}

	.sidebar-toggle {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		z-index: 10;
		padding: 0.3rem  0.3rem  0.1rem  0.3rem;
		background: white;
		border: 1px solid #ddd;
		border-radius: 0;
		color: #666;
		cursor: pointer;
		transition: all 0.2s;
	}

	.sidebar-toggle:hover {
		background: #f5f5f5;
		color: #333;
	}

	.show-sidebar-btn {
		position: absolute;
		top: 0.75rem;
		left: 0.5rem;
		z-index: 10;
		padding: 0.3rem  0.3rem  0.1rem  0.3rem;
		background: white;
		border: 1px solid #ddd;
		border-radius: 0;
		color: #666;
		cursor: pointer;
		transition: all 0.2s;
	}

	.show-sidebar-btn:hover {
		background: #f5f5f5;
		color: #333;
	}

	.sidebar-hidden .sidebar {
		display: none;
	}

	.modal-content {
		position: relative;
		display: grid;
		grid-template-columns: 280px 1fr;
		grid-template-areas: 'sidebar editor';
		height: 100%;
		max-height: 100% !important;
		transition: grid-template-columns 0.3s ease;
	}

	.modal-content.sidebar-hidden {
		grid-template-columns: 1fr;
		grid-template-areas: 'editor';
	}

	.editor-pane {
		position: relative;
		grid-area: editor;
		overflow: hidden;
	}

	.editor-pane.sidebar-closed {
		padding-left: 3rem;
	}

	.sidebar {
		grid-area: sidebar;
		position: relative;
		overflow: hidden;
	}

	.loading,
	.empty-editor {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #666;
	}

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.modal-overlay {
			padding: 0;
		}

		.modal-container {
			border-radius: 0;
		}

		.modal-content {
			grid-template-columns: 240px 1fr;
			grid-template-areas: 'sidebar editor';
		}

		.sidebar-toggle {
			left: 0.5rem;
			top: 0.5rem;
		}

		.close-btn {
			right: 0.5rem;
			top: 0.5rem;
		}
	}

	@media (max-width: 640px) {
		.modal-content {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
			grid-template-areas:
				'sidebar'
				'editor';
		}

		.modal-content.sidebar-hidden {
			grid-template-columns: 1fr;
			grid-template-areas: 'editor';
		}

		.sidebar {
			max-height: 40vh;
		}
	}

	.folder-modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10001;
	}

	.folder-modal {
		background: white;
		padding: 1.5rem;
		border-radius: 0;
		max-width: 450px;
		width: 90%;
		border: 1px solid #ddd;
	}

	.folder-modal h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.125rem;
		color: #1a1a1a;
	}

	.folder-hint {
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
		color: #666;
	}

	.folder-input {
		width: 100%;
		padding: 0.625rem;
		border: 1px solid #ddd;
		border-radius: 0;
		font-size: 0.9375rem;
		font-family: 'Monaspace Xenon', monospace;
		margin-bottom: 1rem;
	}

	.folder-input:focus {
		outline: none;
		border-color: #333;
	}

	.folder-actions {
		display: flex;
		gap: 0.5rem;
	}

	.cancel-btn,
	.create-btn {
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

	.create-btn {
		background: #333;
		color: white;
		border-color: #333;
	}

	.create-btn:hover {
		background: #000;
		border-color: #000;
	}
</style>
