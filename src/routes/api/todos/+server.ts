import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase.js';
import { supabaseAdmin } from '$lib/supabase-admin.js';

// GET - Fetch todos for a calendar
export const GET: RequestHandler = async ({ url, request }) => {
    try {
        const calendarId = url.searchParams.get('calendarId');
        const shareToken = url.searchParams.get('shareToken');
        
        if (!calendarId) {
            return json({ error: 'Calendar ID is required' }, { status: 400 });
        }

        let todos;
        
        if (shareToken) {
            // Handle shared calendar access
            const { data: sharedLink, error: linkError } = await supabaseAdmin
                .from('shared_links')
                .select('calendar_id, permissions')
                .eq('share_token', shareToken)
                .single();

            if (linkError || !sharedLink || sharedLink.calendar_id !== calendarId) {
                return json({ error: 'Invalid share token' }, { status: 403 });
            }

            const { data, error } = await supabaseAdmin
                .from('todos')
                .select('*')
                .eq('calendar_id', calendarId)
                .order('completed', { ascending: true })
                .order('sort_index', { ascending: true });

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            todos = data;
        } else {
            // Handle authenticated user access
            const authHeader = request.headers.get('authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                return json({ error: 'Authorization required' }, { status: 401 });
            }

            const token = authHeader.split(' ')[1];
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);

            if (authError || !user) {
                return json({ error: 'Invalid token' }, { status: 401 });
            }

            const { data, error } = await supabaseAdmin
                .from('todos')
                .select('*')
                .eq('calendar_id', calendarId)
                .order('completed', { ascending: true })
                .order('sort_index', { ascending: true });

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            todos = data;
        }

        return json({ todos });
    } catch (error) {
        console.error('Error fetching todos:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

// POST - Create a new todo
export const POST: RequestHandler = async ({ request, url }) => {
    try {
        const shareToken = url.searchParams.get('shareToken');
        const body = await request.json();
        const { calendarId, text } = body;

        console.log('POST /api/todos - shareToken:', shareToken, 'calendarId:', calendarId, 'text:', text);

        if (!calendarId || !text?.trim()) {
            console.log('Missing required fields');
            return json({ error: 'Calendar ID and text are required' }, { status: 400 });
        }

        if (shareToken) {
            // Handle shared calendar access
            const { data: sharedLink, error: linkError } = await supabaseAdmin
                .from('shared_links')
                .select('calendar_id, permissions')
                .eq('share_token', shareToken)
                .single();

            if (linkError || !sharedLink || sharedLink.calendar_id !== calendarId) {
                return json({ error: 'Invalid share token' }, { status: 403 });
            }

            if (sharedLink.permissions !== 'edit') {
                return json({ error: 'Edit permission required' }, { status: 403 });
            }

            // Get the next sort index
            const { data: lastTodo } = await supabaseAdmin
                .from('todos')
                .select('sort_index')
                .eq('calendar_id', calendarId)
                .eq('completed', false)
                .order('sort_index', { ascending: false })
                .limit(1)
                .single();

            const nextSortIndex = (lastTodo?.sort_index || 0) + 1;

            const { data, error } = await supabaseAdmin
                .from('todos')
                .insert({
                    calendar_id: calendarId,
                    text: text.trim(),
                    completed: false,
                    sort_index: nextSortIndex
                })
                .select()
                .single();

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            return json({ todo: data });
        } else {
            // Handle authenticated user access
            const authHeader = request.headers.get('authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                return json({ error: 'Authorization required' }, { status: 401 });
            }

            const token = authHeader.split(' ')[1];
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);

            console.log('Auth result:', { user: user?.id, authError });

            if (authError || !user) {
                console.log('Auth failed:', authError);
                return json({ error: 'Invalid token' }, { status: 401 });
            }

            // Get the next sort index
            const { data: lastTodo } = await supabaseAdmin
                .from('todos')
                .select('sort_index')
                .eq('calendar_id', calendarId)
                .eq('completed', false)
                .order('sort_index', { ascending: false })
                .limit(1)
                .single();

            const nextSortIndex = Math.max((lastTodo?.sort_index || 0) + 1, 0);
            console.log('Next sort index:', nextSortIndex);

            const { data, error } = await supabaseAdmin
                .from('todos')
                .insert({
                    calendar_id: calendarId,
                    text: text.trim(),
                    completed: false,
                    sort_index: nextSortIndex
                })
                .select()
                .single();

            console.log('Insert result:', { data, error });

            if (error) {
                console.error('Database insert error:', error);
                return json({ error: error.message }, { status: 500 });
            }

            return json({ todo: data });
        }
    } catch (error) {
        console.error('Error creating todo:', error);
        return json({ error: `Internal server error: ${error}` }, { status: 500 });
    }
};

// PUT - Update a todo (text, completion status, or reorder)
export const PUT: RequestHandler = async ({ request, url }) => {
    try {
        const shareToken = url.searchParams.get('shareToken');
        const todoId = url.searchParams.get('todoId');
        const body = await request.json();

        // Handle reorder operations first (they don't need a todoId)
        if (body.reorderData) {
            console.log('Detected reorder operation');
            
            if (shareToken) {
                // Handle shared calendar reorder
                const { data: sharedLink, error: linkError } = await supabaseAdmin
                    .from('shared_links')
                    .select('calendar_id, permissions')
                    .eq('share_token', shareToken)
                    .single();

                if (linkError || !sharedLink) {
                    return json({ error: 'Invalid share token' }, { status: 403 });
                }

                if (sharedLink.permissions !== 'edit') {
                    return json({ error: 'Edit permission required' }, { status: 403 });
                }

                const { todoIds } = body.reorderData;
                
                console.log('Processing reorder for shared calendar:', { todoIds, calendarId: sharedLink.calendar_id });
                
                // Update sort indexes for all reordered todos
                const updates = todoIds.map((id: string, index: number) => {
                    console.log(`Updating shared todo ${id} to sort_index ${index}`);
                    return supabaseAdmin
                        .from('todos')
                        .update({ sort_index: index })
                        .eq('id', id)
                        .eq('calendar_id', sharedLink.calendar_id);
                });

                const results = await Promise.all(updates);
                console.log('Shared reorder update results:', results.map(r => r.error || 'success'));
                
                return json({ success: true });
            } else {
                // Handle authenticated user reorder
                const authHeader = request.headers.get('authorization');
                if (!authHeader?.startsWith('Bearer ')) {
                    return json({ error: 'Authorization required' }, { status: 401 });
                }

                const token = authHeader.split(' ')[1];
                const { data: { user }, error: authError } = await supabase.auth.getUser(token);

                if (authError || !user) {
                    return json({ error: 'Invalid token' }, { status: 401 });
                }

                const { todoIds, calendarId } = body.reorderData;
                
                console.log('Processing reorder for authenticated user:', { todoIds, calendarId });
                
                // Update sort indexes for all reordered todos
                const updates = todoIds.map((id: string, index: number) => {
                    console.log(`Updating todo ${id} to sort_index ${index}`);
                    return supabaseAdmin
                        .from('todos')
                        .update({ sort_index: index })
                        .eq('id', id)
                        .eq('calendar_id', calendarId);
                });

                const results = await Promise.all(updates);
                console.log('Reorder update results:', results.map(r => r.error || 'success'));
                
                return json({ success: true });
            }
        }

        // For regular updates, todoId is required
        if (!todoId) {
            return json({ error: 'Todo ID is required' }, { status: 400 });
        }

        if (shareToken) {
            // Handle shared calendar access
            const { data: sharedLink, error: linkError } = await supabaseAdmin
                .from('shared_links')
                .select('calendar_id, permissions')
                .eq('share_token', shareToken)
                .single();

            if (linkError || !sharedLink) {
                return json({ error: 'Invalid share token' }, { status: 403 });
            }

            if (sharedLink.permissions !== 'edit') {
                return json({ error: 'Edit permission required' }, { status: 403 });
            }

            // Regular update (text, completion status)
            const updateData: any = {};
            if (body.text !== undefined) updateData.text = body.text.trim();
            if (body.completed !== undefined) updateData.completed = body.completed;

            const { data, error } = await supabaseAdmin
                .from('todos')
                .update(updateData)
                .eq('id', todoId)
                .eq('calendar_id', sharedLink.calendar_id)
                .select()
                .single();

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            return json({ todo: data });
        } else {
            // Handle authenticated user access
            const authHeader = request.headers.get('authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                return json({ error: 'Authorization required' }, { status: 401 });
            }

            const token = authHeader.split(' ')[1];
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);

            if (authError || !user) {
                return json({ error: 'Invalid token' }, { status: 401 });
            }

            // Regular update (text, completion status)
            const updateData: any = {};
            if (body.text !== undefined) updateData.text = body.text.trim();
            if (body.completed !== undefined) updateData.completed = body.completed;

            const { data, error } = await supabaseAdmin
                .from('todos')
                .update(updateData)
                .eq('id', todoId)
                .select()
                .single();

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            return json({ todo: data });
        }
    } catch (error) {
        console.error('Error updating todo:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

// DELETE - Delete a todo
export const DELETE: RequestHandler = async ({ request, url }) => {
    try {
        const shareToken = url.searchParams.get('shareToken');
        const todoId = url.searchParams.get('todoId');

        if (!todoId) {
            return json({ error: 'Todo ID is required' }, { status: 400 });
        }

        if (shareToken) {
            // Handle shared calendar access
            const { data: sharedLink, error: linkError } = await supabaseAdmin
                .from('shared_links')
                .select('calendar_id, permissions')
                .eq('share_token', shareToken)
                .single();

            if (linkError || !sharedLink) {
                return json({ error: 'Invalid share token' }, { status: 403 });
            }

            if (sharedLink.permissions !== 'edit') {
                return json({ error: 'Edit permission required' }, { status: 403 });
            }

            const { error } = await supabaseAdmin
                .from('todos')
                .delete()
                .eq('id', todoId)
                .eq('calendar_id', sharedLink.calendar_id);

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            return json({ success: true });
        } else {
            // Handle authenticated user access
            const authHeader = request.headers.get('authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                return json({ error: 'Authorization required' }, { status: 401 });
            }

            const token = authHeader.split(' ')[1];
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);

            if (authError || !user) {
                return json({ error: 'Invalid token' }, { status: 401 });
            }

            const { error } = await supabaseAdmin
                .from('todos')
                .delete()
                .eq('id', todoId);

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            return json({ success: true });
        }
    } catch (error) {
        console.error('Error deleting todo:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};