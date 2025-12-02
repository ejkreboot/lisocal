import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/supabase-admin';

// GET - Fetch goals and progress for a calendar
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

		// Fetch goals
		const { data: goals, error: goalsError } = await supabaseAdmin
			.from('goals')
			.select('*')
			.eq('calendar_id', calendarId)
			.order('sort_index', { ascending: true });

		if (goalsError) {
			console.error('Error fetching goals:', goalsError);
			return json({ error: 'Failed to fetch goals' }, { status: 500 });
		}

		// Fetch progress for all goals
		const goalIds = goals?.map((g) => g.id) || [];
		let progress: any[] = [];

		if (goalIds.length > 0) {
			const { data: progressData, error: progressError } = await supabaseAdmin
				.from('goal_progress')
				.select('*')
				.in('goal_id', goalIds)
				.order('progress_date', { ascending: false });

			if (progressError) {
				console.error('Error fetching progress:', progressError);
				return json({ error: 'Failed to fetch progress' }, { status: 500 });
			}

			progress = progressData || [];
		}

		return json({ goals: goals || [], progress });
	} catch (error) {
		console.error('Error in goals GET:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// POST - Create a new goal
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { calendarId, title, description, target_date, color, category, daily_action } = await request.json();

		if (!calendarId || !title) {
			return json({ error: 'Calendar ID and title are required' }, { status: 400 });
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
		const { data: maxIndexGoal } = await supabaseAdmin
			.from('goals')
			.select('sort_index')
			.eq('calendar_id', calendarId)
			.order('sort_index', { ascending: false })
			.limit(1)
			.single();

		const nextIndex = maxIndexGoal ? maxIndexGoal.sort_index + 1 : 0;

		// Create goal
		const { data: goal, error } = await supabaseAdmin
			.from('goals')
			.insert({
				calendar_id: calendarId,
				title: title.trim(),
				description: description?.trim() || null,
				target_date: target_date || null,
				color: color || '#7c3aed',
				category: category || 'Personal',
				daily_action: daily_action?.trim() || null,
				sort_index: nextIndex
			})
			.select()
			.single();

		if (error) {
			console.error('Error creating goal:', error);
			return json({ error: 'Failed to create goal' }, { status: 500 });
		}

		return json({ goal });
	} catch (error) {
		console.error('Error in goals POST:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// PUT - Update a goal or update progress
export const PUT: RequestHandler = async ({ request, url, locals }) => {
	const goalId = url.searchParams.get('goalId');
	const shareToken = url.searchParams.get('shareToken');

	if (!goalId) {
		return json({ error: 'Goal ID is required' }, { status: 400 });
	}

	try {
		const body = await request.json();

		// Verify access
		if (!shareToken && !locals.user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get goal and verify access
		const { data: goal } = await supabaseAdmin
			.from('goals')
			.select('calendar_id')
			.eq('id', goalId)
			.single();

		if (!goal) {
			return json({ error: 'Goal not found' }, { status: 404 });
		}

		if (shareToken) {
			const { data: sharedLink } = await supabaseAdmin
				.from('shared_links')
				.select('calendar_id, permissions')
				.eq('share_token', shareToken)
				.eq('calendar_id', goal.calendar_id)
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
				.eq('id', goal.calendar_id)
				.eq('user_id', locals.user.id)
				.single();

			if (!calendar) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
		}

		// Handle progress update
		if (body.progress !== undefined) {
			const { progress, notes, progressDate } = body;
			const date = progressDate || new Date().toISOString().split('T')[0];

			// Ensure progress is within valid range
			const validProgress = Math.max(0, Math.min(100, progress));

			// Upsert progress entry
			const { data, error } = await supabaseAdmin
				.from('goal_progress')
				.upsert({
					goal_id: goalId,
					progress_date: date,
					progress_value: validProgress,
					notes: notes || null
				})
				.select()
				.single();

			if (error) {
				console.error('Error updating progress:', error);
				return json({ error: 'Failed to update progress' }, { status: 500 });
			}

			// The trigger will automatically update the goals table
			return json({ progress: data });
		}

		// Handle goal update
		if (body.title !== undefined || body.description !== undefined || body.target_date !== undefined || 
		    body.color !== undefined || body.category !== undefined || body.daily_action !== undefined) {
			const updateData: any = {};
			
			if (body.title !== undefined) updateData.title = body.title.trim();
			if (body.description !== undefined) updateData.description = body.description?.trim() || null;
			if (body.target_date !== undefined) updateData.target_date = body.target_date || null;
			if (body.color !== undefined) updateData.color = body.color;
			if (body.category !== undefined) updateData.category = body.category;
			if (body.daily_action !== undefined) updateData.daily_action = body.daily_action?.trim() || null;

			const { data, error } = await supabaseAdmin
				.from('goals')
				.update(updateData)
				.eq('id', goalId)
				.select()
				.single();

			if (error) {
				console.error('Error updating goal:', error);
				return json({ error: 'Failed to update goal' }, { status: 500 });
			}

			return json({ goal: data });
		}

		// Handle reorder
		if (body.reorderData) {
			const { goalIds, calendarId } = body.reorderData;

			// Update sort_index for each goal
			const updates = goalIds.map((id: string, index: number) => ({
				id,
				sort_index: index
			}));

			for (const update of updates) {
				await supabaseAdmin
					.from('goals')
					.update({ sort_index: update.sort_index })
					.eq('id', update.id)
					.eq('calendar_id', calendarId);
			}

			return json({ success: true });
		}

		return json({ error: 'No valid update data provided' }, { status: 400 });
	} catch (error) {
		console.error('Error in goals PUT:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// DELETE - Delete a goal
export const DELETE: RequestHandler = async ({ url, locals }) => {
	const goalId = url.searchParams.get('goalId');
	const shareToken = url.searchParams.get('shareToken');

	if (!goalId) {
		return json({ error: 'Goal ID is required' }, { status: 400 });
	}

	try {
		// Verify access
		if (!shareToken && !locals.user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get goal and verify access
		const { data: goal } = await supabaseAdmin
			.from('goals')
			.select('calendar_id')
			.eq('id', goalId)
			.single();

		if (!goal) {
			return json({ error: 'Goal not found' }, { status: 404 });
		}

		if (shareToken) {
			const { data: sharedLink } = await supabaseAdmin
				.from('shared_links')
				.select('calendar_id, permissions')
				.eq('share_token', shareToken)
				.eq('calendar_id', goal.calendar_id)
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
				.eq('id', goal.calendar_id)
				.eq('user_id', locals.user.id)
				.single();

			if (!calendar) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}
		}

		// Delete goal (progress and milestones will cascade delete)
		const { error } = await supabaseAdmin.from('goals').delete().eq('id', goalId);

		if (error) {
			console.error('Error deleting goal:', error);
			return json({ error: 'Failed to delete goal' }, { status: 500 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error in goals DELETE:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};