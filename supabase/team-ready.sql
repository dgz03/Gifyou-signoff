-- Team-ready schema for events, text sign-off, and activity history

create table if not exists events (
  id text primary key,
  name text not null,
  start_date timestamptz not null,
  end_date timestamptz,
  total_target int not null,
  per_tone_target int not null default 0,
  tier int not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists text_groups (
  id text primary key,
  name text not null,
  description text,
  event_id text references events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists text_sections (
  id text primary key,
  group_id text not null references text_groups(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists text_items (
  id text primary key,
  title text not null,
  body text not null,
  category text not null,
  status text not null,
  author text not null,
  reviewer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tags text[] not null default '{}',
  review_notes text,
  group_id text references text_groups(id) on delete set null,
  section_id text references text_sections(id) on delete set null
);

create table if not exists activity_logs (
  id text primary key,
  subject_type text not null,
  subject_id text not null,
  action text not null,
  actor text not null,
  timestamp timestamptz not null default now(),
  from_status text,
  to_status text,
  comment text
);

create index if not exists activity_logs_subject_idx
  on activity_logs(subject_type, subject_id);

create table if not exists notification_state (
  id text primary key,
  count int not null default 0,
  last_notified_at timestamptz
);

-- Lock down tables for client access (service role bypasses RLS).
alter table if exists assets enable row level security;
alter table if exists events enable row level security;
alter table if exists text_groups enable row level security;
alter table if exists text_sections enable row level security;
alter table if exists text_items enable row level security;
alter table if exists activity_logs enable row level security;
alter table if exists notification_state enable row level security;
