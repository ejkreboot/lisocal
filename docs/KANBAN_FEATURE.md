# Kanban Board Feature

## Overview

The Kanban board adds a visual project management interface to Lisocal, allowing you to organize your todos by stage and project while maintaining the simple, friction-free experience of the existing todo list.

## Key Features

### Fixed Workflow Lanes
- **Contemplation**: Ideas and tasks you're considering
- **Ready**: Tasks that are ready to be worked on
- **In Progress**: Tasks you're actively working on
- **Done**: Completed tasks

### Project Organization
- Assign todos to projects for better organization
- Visual color-coding by project for quick identification
- Projects are optional - not every task needs a project
- Create new projects on the fly or select from existing ones

### Seamless Integration
- **Shared Data Model**: Todos on the Kanban board are the same todos in your todo list
- **Simple Todo List**: The main todo list remains simple - no stages, just tasks
- **Kanban Enhancement**: The Kanban board adds project and stage context
- **Drag & Drop**: Move cards between stages with simple drag-and-drop

## How It Works

### Data Model
Every todo now has two optional fields:
- `stage`: One of 'Contemplation', 'Ready', 'In Progress', or 'Done'
- `project`: A text string for the project name

**Default behavior:**
- New todos created in the todo list get `stage: 'Ready'` by default
- Completed todos are marked as `stage: 'Done'`
- The todo list doesn't display or require stage/project information
- The Kanban board shows all todos organized by their stage

### Usage Patterns

#### Creating Tasks
1. **Quick entry (Todo List)**: Add tasks without thinking about stages or projects
2. **Structured entry (Kanban)**: Create cards directly in the appropriate lane with project assignment

#### Managing Projects
1. Open the Project Board from the navbar (view_kanban icon)
2. Click "Add card" in any lane to create a new task
3. Enter task description and optional project name
4. Project names autocomplete from your existing projects

#### Moving Tasks Through Stages
- Drag cards between lanes to change their stage
- Click on any card to edit its text or project
- Delete cards using the × button that appears on hover

#### Project Organization
- Tasks with the same project name are color-coded with the same subtle background
- Color assignments are automatic and consistent within a session
- 8 distinct colors cycle for different projects

## Database Migration

### For New Installations
The fields are included in `database_schema.sql`. Run the full schema to set everything up.

### For Existing Installations
Run the migration script in your Supabase SQL editor:

```sql
-- File: migration_add_kanban_fields.sql
-- This adds the necessary fields to existing todos

-- Add stage column (defaults to 'Ready' for existing todos)
ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Ready' 
CHECK (stage IN ('Contemplation', 'Ready', 'In Progress', 'Done'));

-- Add project column
ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS project TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_todos_stage 
ON public.todos(calendar_id, stage);

CREATE INDEX IF NOT EXISTS idx_todos_project 
ON public.todos(calendar_id, project) 
WHERE project IS NOT NULL;

-- Update completed todos to 'Done' stage
UPDATE public.todos 
SET stage = 'Done' 
WHERE completed = true AND stage != 'Done';
```

## API Changes

### POST /api/todos
Now accepts optional fields:
- `stage`: The initial stage for the todo (defaults to 'Ready')
- `project`: The project name (optional)

### PUT /api/todos
Now accepts optional fields for updates:
- `stage`: Update the todo's stage
- `project`: Update the project assignment

### GET /api/todos
Returns todos with `stage` and `project` fields included.

## UI Components

### KanbanBoard.svelte
A new modal component that displays the Kanban view:
- 4-column grid layout (one per stage)
- Drag-and-drop between lanes
- Inline card editing
- Project autocomplete
- Responsive design (stacks columns on mobile)

### TodoModal.svelte (Updated)
Now displays project tags for todos that have been assigned to projects:
- Shows project name as a subtle tag below the task text
- Doesn't add complexity to the simple todo entry workflow
- Projects are only displayed, not edited in this view

### Header.svelte (Updated)
Adds a new icon button for the Kanban board:
- Icon: `view_kanban`
- Title: "Project Board"
- Available in both desktop and mobile menus

## Design Philosophy

### Minimalism First
- The simple todo list stays simple
- Complexity is opt-in via the Kanban view
- No forced project assignments or stage selection

### Progressive Disclosure
- Start with simple task entry
- Graduate to project organization when needed
- Visual organization doesn't complicate the data model

### Tasteful Aesthetics
- Subtle color coding (soft pastels, not bold primaries)
- Clean cards with hover effects
- Smooth transitions and animations
- Consistent with Lisocal's overall design language

### Effortless Interaction
- Drag-and-drop is intuitive and smooth
- Click anywhere on a card to edit
- Add cards with a single click
- Project names autocomplete

## Future Enhancements (Optional)

Potential additions that maintain simplicity:
- Filter by project in the todo list
- Archive completed projects
- Project-level progress indicators
- Export/share project boards
- Keyboard shortcuts for moving cards

## Technical Notes

### Color Management
- Colors are assigned dynamically from a palette
- Assignment persists within a session
- Colors reset on page reload (by design - keeps it simple)
- 8-color palette provides good variety

### Performance
- Indexed queries on stage and project
- Efficient drag-and-drop without unnecessary rerenders
- Lazy loading of modal content

### Accessibility
- All lanes have proper ARIA labels
- Cards are keyboard navigable
- Screen reader friendly
- Focus management for modals
