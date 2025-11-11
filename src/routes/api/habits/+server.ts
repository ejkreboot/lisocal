import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/supabase-admin';

// GET - Fetch habits and completions for a calendar
export const GET: RequestHandler = async ({ url, locals }) => {
	const calendarId = url.searchParams.get('calendarId');
	const shareToken = url.searchParams.get('shareToken');

	if (!calendarId) {
		return json({ error: 'Calendar ID is required' }, { status: 400 });
	}

	try {
		// Verify access (either through user auth or share token)
		if (!shareToken && !locals.user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (shareToken) {
			// Verify share token has access to this calendar
			const { data: sharedLink } = await supabaseAdmin
				.from('shared_links')
				.select('calendar_id, permissions')
				.eq('share_token', shareToken)
				.eq('calendar_id', calendarId)
				.single();

			if (!sharedLink) {
				return json({ error: 'Invalid share token' }, { status: 403 });
			}
		} else {
			// Verify user owns this calendar
			if (!locals.user) {
				return json({ error: 'Unauthorized' }, { status: 401 });
			}
			
			const { data: calendar } = await supabaseAdmin
				.from('calendars')
				.select('user_id')
				.eq('id', calendarId)
				.eq('user_id', locals.user.id)
				.single();

			if (!calendar) {
				return json({ error: 'Calendar not found' }, { status: 404 });
			}
		}

		// Fetch habits
		const { data: habits, error: habitsError } = await supabaseAdmin
			.from('habits')
			.select('*')
			.eq('calendar_id', calendarId)
			.order('sort_index', { ascending: true });

		if (habitsError) {
			console.error('Error fetching habits:', habitsError);
			return json({ error: 'Failed to fetch habits' }, { status: 500 });
		}

		// Fetch completions for all habits
		const habitIds = habits?.map((h) => h.id) || [];
		let completions: any[] = [];

		if (habitIds.length > 0) {
			const { data: completionsData, error: completionsError } = await supabaseAdmin
				.from('habit_completions')
				.select('*')
				.in('habit_id', habitIds);

			if (completionsError) {
				console.error('Error fetching completions:', completionsError);
				return json({ error: 'Failed to fetch completions' }, { status: 500 });
			}

			completions = completionsData || [];
		}

		return json({ habits: habits || [], completions });
	} catch (error) {
		console.error('Error in habits GET:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// POST - Create a new habit
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { calendarId, name, color } = await request.json();

		if (!calendarId || !name) {
			return json({ error: 'Calendar ID and name are required' }, { status: 400 });
		}

		// Verify user owns this calendar
		const { data: calendar } = await supabaseAdmin
			.from('calendars')
			.select('user_id')
			.eq('id', calendarId)
			.eq('user_id', locals.user.id)
			.single();

		if (!calendar) {
			return json({ error: 'Calendar not found' }, { status: 404 });
		}

		// Get max sort_index
		const { data: maxIndexHabit } = await supabaseAdmin
			.from('habits')
			.select('sort_index')
			.eq('calendar_id', calendarId)
			.order('sort_index', { ascending: false })
			.limit(1)
			.single();

		const nextIndex = maxIndexHabit ? maxIndexHabit.sort_index + 1 : 0;

		// Create habit
		const { data: habit, error } = await supabaseAdmin
			.from('habits')
			.insert({
				calendar_id: calendarId,
				name: name.trim(),
				color: color || '#7c3aed',
				sort_index: nextIndex
			})
			.select()
			.single();

		if (error) {
			console.error('Error creating habit:', error);
			return json({ error: 'Failed to create habit' }, { status: 500 });
		}

		return json({ habit });
	} catch (error) {
		console.error('Error in habits POST:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// PUT - Update a habit or toggle completion
export const PUT: RequestHandler = async ({ request, url, locals }) => {
	const habitId = url.searchParams.get('habitId');
	const shareToken = url.searchParams.get('shareToken');

	if (!habitId) {
		return json({ error: 'Habit ID is required' }, { status: 400 });
	}

	try {
		const body = await request.json();

		// Verify access
		if (!shareToken && !locals.user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get habit and verify access
		const { data: habit } = await supabaseAdmin
			.from('habits')
			.select('calendar_id')
			.eq('id', habitId)
			.single();

		if (!habit) {
			return json({ error: 'Habit not found' }, { status: 404 });
		}

		if (shareToken) {
			const { data: sharedLink } = await supabaseAdmin
				.from('shared_links')
				.select('calendar_id, permissions')
				.eq('share_token', shareToken)
				.eq('calendar_id', habit.calendar_id)
				.single();

			if (!sharedLink || sharedLink.permissions !== 'edit') {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
		} else {
			if (!locals.user) {
				return json({ error: 'Unauthorized' }, { status: 401 });
			}
			
			const { data: calendar } = await supabaseAdmin
				.from('calendars')
				.select('user_id')
				.eq('id', habit.calendar_id)
				.eq('user_id', locals.user.id)
				.single();

			if (!calendar) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
		}

		// Handle completion toggle
		if (body.completionDate !== undefined) {
			const { completionDate, completed } = body;

			if (completed) {
				// Add completion
				const { data, error } = await supabaseAdmin
					.from('habit_completions')
					.insert({
						habit_id: habitId,
						completion_date: completionDate
					})
					.select()
					.single();

				if (error) {
					// If already exists, that's ok
					if (error.code === '23505') {
						return json({ success: true });
					}
					console.error('Error creating completion:', error);
					return json({ error: 'Failed to create completion' }, { status: 500 });
				}

				return json({ completion: data });
			} else {
				// Remove completion
				const { error } = await supabaseAdmin
					.from('habit_completions')
					.delete()
					.eq('habit_id', habitId)
					.eq('completion_date', completionDate);

				if (error) {
					console.error('Error deleting completion:', error);
					return json({ error: 'Failed to delete completion' }, { status: 500 });
				}

				return json({ success: true });
			}
		}

		// Handle habit update (name, color)
		if (body.name !== undefined || body.color !== undefined) {
			const updateData: any = {};
			if (body.name) updateData.name = body.name.trim();
			if (body.color) updateData.color = body.color;

			const { data, error } = await supabaseAdmin
				.from('habits')
				.update(updateData)
				.eq('id', habitId)
				.select()
				.single();

			if (error) {
				console.error('Error updating habit:', error);
				return json({ error: 'Failed to update habit' }, { status: 500 });
			}

			return json({ habit: data });
		}

		// Handle reorder
		if (body.reorderData) {
			const { habitIds, calendarId } = body.reorderData;

			// Update sort_index for each habit
			const updates = habitIds.map((id: string, index: number) => ({
				id,
				sort_index: index
			}));

			for (const update of updates) {
				await supabaseAdmin
					.from('habits')
					.update({ sort_index: update.sort_index })
					.eq('id', update.id)
					.eq('calendar_id', calendarId);
			}

			return json({ success: true });
		}

		return json({ error: 'No valid update data provided' }, { status: 400 });
	} catch (error) {
		console.error('Error in habits PUT:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// DELETE - Delete a habit
export const DELETE: RequestHandler = async ({ url, locals }) => {
	const habitId = url.searchParams.get('habitId');
	const shareToken = url.searchParams.get('shareToken');

	if (!habitId) {
		return json({ error: 'Habit ID is required' }, { status: 400 });
	}

	try {
		// Verify access
		if (!shareToken && !locals.user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get habit and verify access
		const { data: habit } = await supabaseAdmin
			.from('habits')
			.select('calendar_id')
			.eq('id', habitId)
			.single();

		if (!habit) {
			return json({ error: 'Habit not found' }, { status: 404 });
		}

		if (shareToken) {
			const { data: sharedLink } = await supabaseAdmin
				.from('shared_links')
				.select('calendar_id, permissions')
				.eq('share_token', shareToken)
				.eq('calendar_id', habit.calendar_id)
				.single();

			if (!sharedLink || sharedLink.permissions !== 'edit') {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
		} else {
			if (!locals.user) {
				return json({ error: 'Unauthorized' }, { status: 401 });
			}
			
			const { data: calendar } = await supabaseAdmin
				.from('calendars')
				.select('user_id')
				.eq('id', habit.calendar_id)
				.eq('user_id', locals.user.id)
				.single();

			if (!calendar) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
		}

		// Delete habit (completions will cascade delete)
		const { error } = await supabaseAdmin.from('habits').delete().eq('id', habitId);

		if (error) {
			console.error('Error deleting habit:', error);
			return json({ error: 'Failed to delete habit' }, { status: 500 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error in habits DELETE:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
