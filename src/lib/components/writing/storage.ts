import { supabase } from '$lib/supabase';

export interface FileMetadata {
	name: string;
	path: string;
	created_at: string;
	updated_at: string;
	isDirectory?: boolean;
}

export interface DirectoryNode {
	name: string;
	path: string;
	isDirectory: boolean;
	children?: DirectoryNode[];
	file?: FileMetadata;
}

const BUCKET_NAME = 'lisocal_write';

/**
 * Recursively list all files and folders for a user
 */
export async function listFiles(userId: string): Promise<FileMetadata[]> {
	const allFiles: FileMetadata[] = [];
	const directories = new Set<string>();
	await listFilesRecursive(userId, '', allFiles, directories);
	
	// Add directories as entries so they appear in the tree
	for (const dirPath of directories) {
		allFiles.push({
			name: dirPath.split('/').pop() || dirPath,
			path: `${userId}/${dirPath}`,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			isDirectory: true
		});
	}
	
	return allFiles;
}

async function listFilesRecursive(userId: string, prefix: string, result: FileMetadata[], directories: Set<string>): Promise<void> {
	const fullPrefix = prefix ? `${userId}/${prefix}` : userId;
	const { data, error } = await supabase.storage.from(BUCKET_NAME).list(fullPrefix, {
		limit: 1000,
		sortBy: { column: 'name', order: 'asc' }
	});

	if (error) {
		console.error('Error listing files:', error);
		return;
	}

	for (const item of data || []) {
		const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
		
		if (item.id === null) {
			// This is a directory
			directories.add(itemPath);
			// Recurse into it
			await listFilesRecursive(userId, itemPath, result, directories);
		} else {
			// This is a file - skip .keep placeholder files
			if (item.name === '.keep') {
				continue;
			}
			
			result.push({
				name: item.name,
				path: `${userId}/${itemPath}`,
				created_at: item.created_at,
				updated_at: item.updated_at,
				isDirectory: false
			});
		}
	}
}

/**
 * Download and read a file's content
 */
export async function downloadFile(path: string): Promise<string | null> {
	// Use a short-lived signed URL and force no-store to avoid CDN/browser cache
	const { data, error } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(path, 60);

	if (error || !data?.signedUrl) {
		console.error('Error creating signed download URL:', error);
		return null;
	}

	const url = new URL(data.signedUrl);
	url.searchParams.set('cb', Date.now().toString());

	const response = await fetch(url.toString(), { cache: 'no-store' });
	if (!response.ok) {
		console.error('Error fetching file:', response.status, response.statusText);
		return null;
	}

	return await response.text();
}

/**
 * Upload/save a file (upsert mode)
 */
export async function uploadFile(path: string, content: string): Promise<boolean> {
	const blob = new Blob([content], { type: 'text/markdown' });

	const { error } = await supabase.storage.from(BUCKET_NAME).upload(path, blob, {
		contentType: 'text/markdown',
		cacheControl: '0',
		upsert: true
	});

	if (error) {
		console.error('Error uploading file:', error);
		return false;
	}

	return true;
}

/**
 * Move/rename a file
 */
export async function moveFile(oldPath: string, newPath: string): Promise<boolean> {
	const { error } = await supabase.storage.from(BUCKET_NAME).move(oldPath, newPath);

	if (error) {
		console.error('Error moving file:', error);
		return false;
	}

	return true;
}

/**
 * Delete a file
 */
export async function deleteFile(path: string): Promise<boolean> {
	const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);

	if (error) {
		console.error('Error deleting file:', error);
		return false;
	}

	return true;
}

/**
 * Check if a directory is empty
 */
export async function isDirectoryEmpty(userId: string, dirPath: string): Promise<boolean> {
	const fullPath = `${userId}/${dirPath}`;
	const { data, error } = await supabase.storage.from(BUCKET_NAME).list(fullPath, {
		limit: 10
	});

	if (error) {
		console.error('Error checking directory:', error);
		return false;
	}

	// Empty if no files or only .keep file exists
	return !data || data.length === 0 || (data.length === 1 && data[0].name === '.keep');
}

/**
 * Delete an empty directory (removes the .keep file)
 */
export async function deleteDirectory(userId: string, dirPath: string): Promise<boolean> {
	// Check if directory is empty first
	const isEmpty = await isDirectoryEmpty(userId, dirPath);
	if (!isEmpty) {
		console.error('Cannot delete non-empty directory');
		return false;
	}

	// Delete the .keep file
	const keepPath = `${userId}/${dirPath}/.keep`;
	const { error } = await supabase.storage.from(BUCKET_NAME).remove([keepPath]);

	if (error) {
		console.error('Error deleting directory:', error);
		return false;
	}

	return true;
}

/**
 * Create a directory by uploading a placeholder file
 */
export async function createDirectory(userId: string, dirPath: string): Promise<boolean> {
	// Create a .keep file to establish the directory
	const placeholder = new Blob([''], { type: 'text/plain' });
	const fullPath = `${userId}/${dirPath}/.keep`;

	const { error } = await supabase.storage.from(BUCKET_NAME).upload(fullPath, placeholder, {
		contentType: 'text/plain',
		cacheControl: '0',
		upsert: false
	});

	if (error) {
		console.error('Error creating directory:', error);
		return false;
	}

	return true;
}

/**
 * Build a tree structure from a flat list of files
 */
export function buildDirectoryTree(files: FileMetadata[], userId: string): DirectoryNode[] {
	const root: DirectoryNode[] = [];
	
	for (const file of files) {
		// Remove userId prefix from path
		const relativePath = file.path.replace(`${userId}/`, '');
		const parts = relativePath.split('/');
		
		// Skip if this is a directory entry - we'll create it when processing files or explicitly below
		if (file.isDirectory) {
			continue;
		}
		
		let currentLevel = root;
		
		// Navigate/create directory structure
		for (let i = 0; i < parts.length - 1; i++) {
			const dirName = parts[i];
			let dir = currentLevel.find(n => n.name === dirName && n.isDirectory);
			
			if (!dir) {
				dir = {
					name: dirName,
					path: parts.slice(0, i + 1).join('/'),
					isDirectory: true,
					children: []
				};
				currentLevel.push(dir);
				currentLevel.sort((a, b) => {
					if (a.isDirectory && !b.isDirectory) return -1;
					if (!a.isDirectory && b.isDirectory) return 1;
					return a.name.localeCompare(b.name);
				});
			}
			
			currentLevel = dir.children!;
		}
		
		// Add the file
		currentLevel.push({
			name: parts[parts.length - 1],
			path: relativePath,
			isDirectory: false,
			file
		});
		
		// Sort files after directories
		currentLevel.sort((a, b) => {
			if (a.isDirectory && !b.isDirectory) return -1;
			if (!a.isDirectory && b.isDirectory) return 1;
			return a.name.localeCompare(b.name);
		});
	}
	
	// Now add any empty directories (those marked as isDirectory in files)
	for (const file of files) {
		if (!file.isDirectory) continue;
		
		const relativePath = file.path.replace(`${userId}/`, '');
		const parts = relativePath.split('/');
		
		let currentLevel = root;
		
		// Navigate/create directory structure for empty dirs
		for (let i = 0; i < parts.length; i++) {
			const dirName = parts[i];
			let dir = currentLevel.find(n => n.name === dirName && n.isDirectory);
			
			if (!dir) {
				dir = {
					name: dirName,
					path: parts.slice(0, i + 1).join('/'),
					isDirectory: true,
					children: []
				};
				currentLevel.push(dir);
				currentLevel.sort((a, b) => {
					if (a.isDirectory && !b.isDirectory) return -1;
					if (!a.isDirectory && b.isDirectory) return 1;
					return a.name.localeCompare(b.name);
				});
			}
			
			if (i < parts.length - 1) {
				currentLevel = dir.children!;
			}
		}
	}
	
	return root;
}

/**
 * Generate a unique filename based on the current date
 */
export function generateDefaultFilename(existingFiles: FileMetadata[]): string {
	const today = new Date();
	const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
	
	let filename = `${dateStr}.md`;
	let counter = 1;
	
	const existingNames = existingFiles.map(f => f.name);
	
	while (existingNames.includes(filename)) {
		filename = `${dateStr}-${counter}.md`;
		counter++;
	}
	
	return filename;
}

/**
 * Validate and sanitize a filename
 */
export function sanitizeFilename(filename: string): string {
	// Remove special characters, keep alphanumeric, dash, underscore, and period
	let sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
	
	// Ensure it ends with .md
	if (!sanitized.endsWith('.md')) {
		sanitized += '.md';
	}
	
	return sanitized;
}

/**
 * Validate and sanitize a file path (including directory path)
 */
export function sanitizeFilePath(path: string): string {
	// Split into directory and filename parts
	const parts = path.split('/');
	const filename = parts.pop() || '';
	const dirPath = parts.join('/');
	
	// Sanitize directory path
	let sanitizedDir = '';
	if (dirPath) {
		sanitizedDir = sanitizeDirectoryPath(dirPath);
	}
	
	// Sanitize filename
	let sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
	if (!sanitizedFilename.endsWith('.md')) {
		sanitizedFilename += '.md';
	}
	
	// Combine back together
	return sanitizedDir ? `${sanitizedDir}/${sanitizedFilename}` : sanitizedFilename;
}

/**
 * Validate and sanitize a directory name/path
 */
export function sanitizeDirectoryPath(path: string): string {
	// Remove special characters, keep alphanumeric, dash, underscore, forward slash
	let sanitized = path.replace(/[^a-zA-Z0-9_/-]/g, '-');
	
	// Remove leading/trailing slashes and normalize multiple slashes
	sanitized = sanitized.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
	
	return sanitized;
}
