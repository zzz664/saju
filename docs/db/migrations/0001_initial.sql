-- v2.3 설계용 최초 마이그레이션 초안
-- 주의: 실제 Supabase DB에서 실행/검증하지 않음. SQL RLS 및 트랜잭션 테스트 필요.
-- 프로덕션 운영 결제는 의도적으로 스키마에 허용하지 않는다(test 전용).

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.birth_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text check (label is null or char_length(label) <= 80),
  birth_date date not null,
  birth_time time,
  time_known boolean not null,
  calendar_type text not null check (calendar_type in ('solar','lunar')),
  is_leap_month boolean not null default false,
  timezone_id text not null,
  longitude_deg numeric(8,5),
  latitude_deg numeric(8,5),
  direction_basis text check (direction_basis in ('male','female','unspecified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_birth_time check (
    (time_known and birth_time is not null) or
    ((not time_known) and birth_time is null)
  ),
  constraint valid_lunar_leap check (calendar_type = 'lunar' or not is_leap_month),
  constraint valid_longitude check (longitude_deg is null or longitude_deg between -180 and 180),
  constraint valid_latitude check (latitude_deg is null or latitude_deg between -90 and 90),
  unique (id, user_id)
);
create index if not exists birth_profiles_user_idx on public.birth_profiles(user_id, created_at desc);

create table if not exists public.feature_definitions (
  feature_id text primary key check (feature_id ~ '^F(0[1-9]|1[01])$'),
  feature_group text not null check (feature_group in ('natal','temporal','pair')),
  description text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  birth_profile_id uuid not null,
  pair_birth_profile_id uuid,
  feature_id text not null references public.feature_definitions(feature_id),
  target_json jsonb not null default '{}'::jsonb,
  input_hash text not null,
  status text not null default 'pending' check (status in ('pending','complete','partial','failed')),
  result_json jsonb,
  schema_version text not null,
  calculation_policy_version text not null,
  rules_version text not null,
  library_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_birth_profile foreign key (birth_profile_id, user_id)
    references public.birth_profiles(id, user_id) on delete cascade,
  constraint owner_pair_profile foreign key (pair_birth_profile_id, user_id)
    references public.birth_profiles(id, user_id) on delete cascade,
  constraint pair_required_for_f11 check ((feature_id = 'F11') = (pair_birth_profile_id is not null))
);
create index if not exists analysis_runs_owner_idx on public.analysis_runs(user_id, created_at desc);
create index if not exists analysis_runs_feature_idx on public.analysis_runs(feature_id, created_at desc);

create table if not exists public.narrations (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
  persona_id text not null,
  persona_version text not null,
  prompt_version text not null,
  output_schema_version text not null,
  model_id text not null,
  status text not null default 'pending' check (status in ('pending','complete','failed')),
  output_json jsonb,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  created_at timestamptz not null default now()
);
create index if not exists narrations_analysis_idx on public.narrations(analysis_run_id, created_at desc);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  feature_id text not null references public.feature_definitions(feature_id),
  offer_code text not null unique,
  price_krw integer not null check (price_krw >= 100),
  currency text not null default 'KRW' check (currency = 'KRW'),
  environment text not null default 'test' check (environment = 'test'),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
-- 상품/가격은 확정 전이므로 의도적으로 offer 데이터를 seed하지 않는다.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id),
  request_id uuid not null,
  order_code text not null unique check (char_length(order_code) between 6 and 64),
  amount_krw integer not null check (amount_krw >= 100),
  currency text not null default 'KRW' check (currency = 'KRW'),
  environment text not null default 'test' check (environment = 'test'),
  status text not null default 'created' check (
    status in ('created','awaiting_payment','confirming','paid_test',
               'failed','cancelled','expired','refunded_test')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id),
  unique (id, user_id)
);
create index if not exists orders_owner_idx on public.orders(user_id, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null default 'toss_test',
  environment text not null default 'test' check (environment = 'test'),
  payment_key text not null unique,
  provider_status text not null,
  approved_amount_krw integer not null check (approved_amount_krw >= 0),
  merchant_id text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null unique,
  feature_id text not null references public.feature_definitions(feature_id),
  environment text not null default 'test' check (environment = 'test'),
  status text not null default 'active_test' check (status in ('active_test','revoked_test')),
  created_at timestamptz not null default now(),
  constraint entitlement_owner_order foreign key (order_id, user_id)
    references public.orders(id, user_id) on delete cascade
);
create index if not exists entitlements_owner_idx on public.entitlements(user_id, feature_id);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  transmission_id text,
  event_type text not null,
  processing_status text not null default 'received' check (
    processing_status in ('received','verified','processed','ignored','failed')
  ),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, transmission_id)
);

-- Feature IDs only. No brand/product name decided.
insert into public.feature_definitions (feature_id, feature_group, description) values
('F01','natal','기본 사주·종합 원국 풀이'),
('F02','natal','타고난 성격·기질'),
('F03','natal','오행·십성 기반 강점·약점'),
('F04','natal','직업 적성·업무 성향'),
('F05','natal','재물 성향·금전 관리 성향'),
('F06','natal','연애 성향·관계 패턴'),
('F07','natal','신살·특수 성향'),
('F08','temporal','대운·인생 시기별 운세'),
('F09','temporal','세운·신년운세'),
('F10','temporal','월운·일운·오늘의 운세'),
('F11','pair','두 사람의 궁합')
on conflict (feature_id) do nothing;

-- RLS: deny unless explicitly allowed.
alter table public.profiles enable row level security;
alter table public.birth_profiles enable row level security;
alter table public.feature_definitions enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.narrations enable row level security;
alter table public.offers enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.entitlements enable row level security;
alter table public.payment_webhook_events enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.birth_profiles from anon, authenticated;
revoke all on public.feature_definitions from anon, authenticated;
revoke all on public.analysis_runs from anon, authenticated;
revoke all on public.narrations from anon, authenticated;
revoke all on public.offers from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.entitlements from anon, authenticated;
revoke all on public.payment_webhook_events from anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.birth_profiles to authenticated;
grant select on public.feature_definitions to anon, authenticated;
grant select on public.analysis_runs to authenticated;
grant select on public.narrations to authenticated;
grant select on public.offers to anon, authenticated;
grant select on public.orders to authenticated;
-- Only non-sensitive payment columns can be read directly; payment_key stays server-only.
grant select (id, order_id, provider, environment, provider_status, approved_amount_krw, approved_at, created_at)
 on public.payments to authenticated;
grant select on public.entitlements to authenticated;

create policy profile_select_own on public.profiles
 for select to authenticated using ((select auth.uid()) = id);
create policy profile_insert_own on public.profiles
 for insert to authenticated with check ((select auth.uid()) = id);
create policy profile_update_own on public.profiles
 for update to authenticated
 using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy birth_select_own on public.birth_profiles
 for select to authenticated using ((select auth.uid()) = user_id);
create policy birth_insert_own on public.birth_profiles
 for insert to authenticated with check ((select auth.uid()) = user_id);
create policy birth_update_own on public.birth_profiles
 for update to authenticated
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy birth_delete_own on public.birth_profiles
 for delete to authenticated using ((select auth.uid()) = user_id);

create policy features_public_enabled on public.feature_definitions
 for select to anon, authenticated using (enabled = true);
create policy offers_public_active_test on public.offers
 for select to anon, authenticated using (active = true and environment = 'test');

create policy analyses_select_own on public.analysis_runs
 for select to authenticated using ((select auth.uid()) = user_id);
create policy narrations_select_own on public.narrations
 for select to authenticated using (
   exists (select 1 from public.analysis_runs ar
           where ar.id = narrations.analysis_run_id and ar.user_id = (select auth.uid()))
 );
create policy orders_select_own on public.orders
 for select to authenticated using ((select auth.uid()) = user_id);
create policy payments_select_own on public.payments
 for select to authenticated using (
   exists (select 1 from public.orders o
           where o.id = payments.order_id and o.user_id = (select auth.uid()))
 );
create policy entitlements_select_own on public.entitlements
 for select to authenticated using ((select auth.uid()) = user_id);

-- No INSERT/UPDATE/DELETE policy/grant for payments/orders/entitlements/analyses/narrations:
-- trusted server or narrowly audited DB transaction must perform writes after auth and ownership checks.
-- No authenticated or anonymous grants for webhook events.
-- Review auth & RLS tests in an actual Supabase instance before deployment.
