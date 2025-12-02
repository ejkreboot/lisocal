import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/supabase-admin.js';

// GET - Fetch a random coaching prompt
export const GET: RequestHandler = async ({ url }) => {
    try {
        const role = url.searchParams.get('role');
        
        let query = supabaseAdmin
            .from('coaching_prompts')
            .select('*');
        
        if (role) {
            query = query.eq('role', role);
        }
        
        const { data, error } = await query;

        if (error) {
            return json({ error: error.message }, { status: 500 });
        }

        if (!data || data.length === 0) {
            return json({ error: 'No prompts found' }, { status: 404 });
        }

        // Select a random prompt
        const randomPrompt = data[Math.floor(Math.random() * data.length)];

        return json({ prompt: randomPrompt });
    } catch (err) {
        console.error('Error fetching coaching prompt:', err);
        return json({ error: 'Failed to fetch coaching prompt' }, { status: 500 });
    }
};
