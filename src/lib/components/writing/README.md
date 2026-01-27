# Writing Feature

A distraction-free writing/journaling feature for Lisocal.

## Components

### `storage.ts`
Utility functions for interacting with Supabase Storage:
- `listFiles()` - Get all files for a user
- `downloadFile()` - Read file content
- `uploadFile()` - Save file (with upsert)
- `moveFile()` - Rename/move files
- `deleteFile()` - Remove files
- `generateDefaultFilename()` - Create dated filenames
- `sanitizeFilename()` - Validate and clean filenames

### `Editor.svelte`
The main text editor with:
- Monospace font (Monaspace Xenon)
- Double line-height for readability
- 65-character max-width
- Autosave (1 second after typing stops)
- Inline filename editing
- Save status indicator

### `FileBrowser.svelte`
Sidebar file list with:
- "New" button for creating files
- File list sorted by update time
- Active file highlighting
- Delete functionality with confirmation
- Empty state messaging

### `WritingModal.svelte`
Full-screen modal container:
- Collapsible sidebar
- Responsive layout
- Keyboard shortcuts (Esc to close)
- Automatic file loading on open

### `WritingToolbarButton.svelte`
Toolbar button component (currently unused - integrated directly in Header)

## Storage Structure

Files are stored in Supabase Storage bucket `lisocal_write`:
- Path: `{user_id}/{filename}.md`
- Example: `abc123-def456/2025-01-27.md`

## Usage

Click the "Writing" button in the toolbar to open the modal. 

### Creating Files
- Click "New" in the sidebar
- Default filename is current date (YYYY-MM-DD.md)
- If date file exists, appends number (2025-01-27-1.md)

### Editing Files
- Click filename in sidebar to open
- Text autosaves 1 second after typing stops
- Click filename at top to rename

### Deleting Files
- Hover over file in sidebar
- Click delete icon
- Confirm deletion

## Keyboard Shortcuts

- **Esc** - Close modal
- **Enter** (in filename) - Save filename
- **Esc** (in filename) - Cancel filename edit

## Styling

The editor uses a distraction-free design:
- Clean, minimal interface
- Monospace font for writing
- Double line-height for readability
- Centered 65-character column
- Off-white background to reduce eye strain
