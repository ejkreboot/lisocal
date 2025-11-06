import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase.js';
import { supabaseAdmin } from '$lib/supabase-admin.js';

// GET - Fetch notes for a calendar
export const GET: RequestHandler = async ({ url, request }) => {
    try {
        const calendarId = url.searchParams.get('calendarId');
        const shareToken = url.searchParams.get('shareToken');
        
        if (!calendarId) {
            return json({ error: 'Calendar ID is required' }, { status: 400 });
        }

        let notes;
        
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
                .from('notes')
                .select('*')
                .eq('calendar_id', calendarId)
                .order('sort_index', { ascending: true });

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            notes = data;
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
                .from('notes')
                .select('*')
                .eq('calendar_id', calendarId)
                .order('sort_index', { ascending: true });

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            notes = data;
        }

        return json({ notes });
    } catch (error) {
        console.error('Error fetching notes:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

// POST - Create a new note
export const POST: RequestHandler = async ({ request, url }) => {
    try {
        const shareToken = url.searchParams.get('shareToken');
        const body = await request.json();
        const { calendarId, content = '' } = body;

        if (!calendarId) {
            return json({ error: 'Calendar ID is required' }, { status: 400 });
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
            const { data: lastNote } = await supabaseAdmin
                .from('notes')
                .select('sort_index')
                .eq('calendar_id', calendarId)
                .order('sort_index', { ascending: false })
                .limit(1)
                .single();

            const nextSortIndex = (lastNote?.sort_index || 0) + 1;

            const { data, error } = await supabaseAdmin
                .from('notes')
                .insert({
                    calendar_id: calendarId,
                    content: content.trim(),
                    sort_index: nextSortIndex
                })
                .select()
                .single();

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            return json({ note: data });
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

            // Get the next sort index
            const { data: lastNote } = await supabaseAdmin
                .from('notes')
                .select('sort_index')
                .eq('calendar_id', calendarId)
                .order('sort_index', { ascending: false })
                .limit(1)
                .single();

            const nextSortIndex = Math.max((lastNote?.sort_index || 0) + 1, 0);
            
            const { data, error } = await supabaseAdmin
                .from('notes')
                .insert({
                    calendar_id: calendarId,
                    content: content.trim(),
                    sort_index: nextSortIndex
                })
                .select()
                .single();

            if (error) {
                console.error('Database insert error:', error);
                return json({ error: error.message }, { status: 500 });
            }

            return json({ note: data });
        }
    } catch (error) {
        console.error('Error creating note:', error);
        return json({ error: `Internal server error: ${error}` }, { status: 500 });
    }
};

// PUT - Update a note (title, content, or reorder)
export const PUT: RequestHandler = async ({ request, url }) => {
    try {
        const shareToken = url.searchParams.get('shareToken');
        const noteId = url.searchParams.get('noteId');
        const body = await request.json();

        // Handle reorder operations first (they don't need a noteId)
        if (body.reorderData) {
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

                const { noteIds } = body.reorderData;
                
                // Update sort indexes for all reordered notes
                const updates = noteIds.map((id: string, index: number) => {
                    return supabaseAdmin
                        .from('notes')
                        .update({ sort_index: index })
                        .eq('id', id)
                        .eq('calendar_id', sharedLink.calendar_id);
                });

                await Promise.all(updates);
                
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

                const { noteIds, calendarId } = body.reorderData;
                
                // Update sort indexes for all reordered notes
                const updates = noteIds.map((id: string, index: number) => {
                    return supabaseAdmin
                        .from('notes')
                        .update({ sort_index: index })
                        .eq('id', id)
                        .eq('calendar_id', calendarId);
                });

                await Promise.all(updates);
                
                return json({ success: true });
            }
        }

        // For regular updates, noteId is required
        if (!noteId) {
            return json({ error: 'Note ID is required' }, { status: 400 });
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

            // Regular update (content)
            const updateData: any = {};
            if (body.content !== undefined) updateData.content = body.content.trim();

            const { data, error } = await supabaseAdmin
                .from('notes')
                .update(updateData)
                .eq('id', noteId)
                .eq('calendar_id', sharedLink.calendar_id)
                .select()
                .single();

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            return json({ note: data });
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

            // Regular update (content)
            const updateData: any = {};
            if (body.content !== undefined) updateData.content = body.content.trim();

            const { data, error } = await supabaseAdmin
                .from('notes')
                .update(updateData)
                .eq('id', noteId)
                .select()
                .single();

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            return json({ note: data });
        }
    } catch (error) {
        console.error('Error updating note:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

// DELETE - Delete a note
export const DELETE: RequestHandler = async ({ request, url }) => {
    try {
        const shareToken = url.searchParams.get('shareToken');
        const noteId = url.searchParams.get('noteId');

        if (!noteId) {
            return json({ error: 'Note ID is required' }, { status: 400 });
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
                .from('notes')
                .delete()
                .eq('id', noteId)
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
                .from('notes')
                .delete()
                .eq('id', noteId);

            if (error) {
                return json({ error: error.message }, { status: 500 });
            }

            return json({ success: true });
        }
    } catch (error) {
        console.error('Error deleting note:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};