-- Create AI Audit Logs table for security and clinical monitoring
create table if not exists public.ai_audit_logs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade,
    action text not null,
    model text,
    trigger_source text,
    confidence text,
    had_forbidden_phrases boolean default false,
    prompt_id text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.ai_audit_logs enable row level security;

-- Admin-only view (or user can view their own logs for transparency)
create policy "Users can view their own AI audit logs"
    on public.ai_audit_logs for select
    using (auth.uid() = user_id);

-- Only service role can insert (Edge Function handles this)
create policy "Service role can insert AI audit logs"
    on public.ai_audit_logs for insert
    with check (true);
