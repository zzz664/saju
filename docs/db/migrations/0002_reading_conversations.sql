-- v2.4 chat/report persistence migration draft (after 0001_initial.sql)
-- NOT executed on Supabase. RLS and FK tests required before deployment.
-- Server writes only after auth/ownership/entitlement checks.

-- Enable composite FK without trusting frontend-supplied user_id.
alter table public.analysis_runs
  add constraint analysis_runs_id_user_unique unique (id, user_id);

create table if not exists public.reading_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_run_id uuid not null,
  narration_id uuid references public.narrations(id) on delete set null,
  persona_id text not null,
  persona_version text not null,
  model_id text not null default 'gpt-4o-mini',
  prompt_version text not null,
  report_status text not null default 'pending' check
    (report_status in ('pending','streaming','interrupted','failed','completed')),
  plan_json jsonb not null default '[]'::jsonb,
  total_segments integer not null default 0 check (total_segments >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reading_conv_owner_analysis foreign key (analysis_run_id, user_id)
    references public.analysis_runs (id, user_id) on delete cascade,
  unique (id, user_id),
  unique (analysis_run_id, persona_id, persona_version, prompt_version)
);
create index if not exists reading_conv_owner_idx
  on public.reading_conversations(user_id, created_at desc);

-- Only completed/validated message bodies are stored here. Stream deltas remain transient.
create table if not exists public.reading_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null,
  sequence_no integer not null check (sequence_no > 0),
  role text not null check (role in ('assistant','user')),
  kind text not null check (kind in ('report','followup')),
  section_id text,
  content text not null check (char_length(btrim(content)) between 1 and 8000),
  evidence_ids text[] not null default array[]::text[],
  request_id uuid,
  created_at timestamptz not null default now(),
  constraint reading_message_owner_conversation
    foreign key (conversation_id, user_id)
    references public.reading_conversations(id, user_id) on delete cascade,
  constraint reading_message_role_kind check (
    (role = 'assistant' and kind in ('report','followup'))
    or (role = 'user' and kind = 'followup')
  ),
  constraint report_section_required check
    ((kind = 'report' and role = 'assistant' and section_id is not null)
    or (kind = 'followup' and section_id is null)),
  unique (conversation_id, sequence_no),
  -- The user question and its assistant reply deliberately share one request_id.
  -- Deduplicate per role so both messages may be saved exactly once.
  unique (conversation_id, request_id, role)
);
create index if not exists reading_messages_conv_order_idx
  on public.reading_messages(conversation_id, sequence_no);

-- Application-level advisory/transaction lock or a distinct server job lock is REQUIRED
-- for concurrent report/reply streaming. Unique constraints alone don't serialize streams.
-- Never accept user_id from the browser as the authorized owner.

alter table public.reading_conversations enable row level security;
alter table public.reading_messages enable row level security;
revoke all on public.reading_conversations from anon, authenticated;
revoke all on public.reading_messages from anon, authenticated;
grant select on public.reading_conversations to authenticated;
grant select on public.reading_messages to authenticated;

create policy reading_conv_select_own on public.reading_conversations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy reading_msg_select_own on public.reading_messages
  for select to authenticated using ((select auth.uid()) = user_id);

-- No client insert/update/delete grants or policies.
-- Service-role bypasses RLS: server MUST compare auth UID, analysis ownership,
-- entitlement and report status before each write/stream. Validate narration_id
-- references the same analysis_run_id in the trusted service layer.
-- On analysis deletion cascade removes conversations/messages;
-- narration deletion sets narration_id NULL without deleting report messages.
