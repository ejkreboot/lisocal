-- Create coaching_prompts table
create table if not exists public.coaching_prompts (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  prompt text not null,
  role text not null
);

-- Enable RLS
alter table public.coaching_prompts enable row level security;

-- Create policy to allow read access to all authenticated users
create policy "Allow read access to all authenticated users"
  on public.coaching_prompts
  for select
  to authenticated
  using (true);

-- Insert initial prompts
insert into public.coaching_prompts (prompt, role) values
('What small action today feels most in harmony with that idea?', 'Thought Of The Day Connection'),
('How might this quote nudge your next step toward your future self?', 'Thought Of The Day Connection'),
('What’s one move you can make today that reflects this insight?', 'Thought Of The Day Connection'),
('How could this perspective shape the tiniest step toward your goal?', 'Thought Of The Day Connection'),
('What part of your True North feels most connected to this idea right now?', 'Thought Of The Day Connection'),
('If this quote were advice for you today, what would it be pointing at?', 'Thought Of The Day Connection'),
('Which direction does this insight invite you to lean toward today?', 'Thought Of The Day Connection'),
('How does this idea change what “progress” looks like for you today?', 'Thought Of The Day Connection'),
('What’s one thing you could do that would express this principle in action?', 'Thought Of The Day Connection'),
('How might this quote guide a single, real-world step today?', 'Thought Of The Day Connection'),
('If you let this idea settle, what next action naturally arises?', 'Thought Of The Day Connection'),
('What’s one gentle step toward your True North that aligns with this thought?', 'Thought Of The Day Connection'),
('Where does this quote shine a light on your path today?', 'Thought Of The Day Connection'),
('What feels like the most honest next step after reading this?', 'Thought Of The Day Connection'),
('How could this idea shape how you show up for your goal today?', 'Thought Of The Day Connection'),
('If you followed the spirit of this quote, what would you do next?', 'Thought Of The Day Connection'),
('Where in your life does this idea want to move?', 'Thought Of The Day Connection'),
('What’s one doable action that echoes this theme?', 'Thought Of The Day Connection'),
('How does this perspective shift what matters most today?', 'Thought Of The Day Connection'),
('What tiny act today would honor this insight?', 'Thought Of The Day Connection'),
('If this quote were a compass, where would it point you right now?', 'Thought Of The Day Connection'),
('How could this idea help you choose your “one thing” for the day?', 'Thought Of The Day Connection'),
('Which step toward your future self feels more visible after reading this?', 'Thought Of The Day Connection'),
('What’s one area of your True North that this quote brings clarity to?', 'Thought Of The Day Connection'),
('How does this idea reshape the smallest action you could take next?', 'Thought Of The Day Connection'),
('If you listened closely, what action would this quote suggest today?', 'Thought Of The Day Connection'),
('What feels newly possible toward your goal after sitting with this thought?', 'Thought Of The Day Connection'),
('How might this insight influence the tone of your next step?', 'Thought Of The Day Connection'),
('What’s the simplest way to express this idea through action today?', 'Thought Of The Day Connection'),
('If you applied this thought for just five minutes today, what would you do?', 'Thought Of The Day Connection');
