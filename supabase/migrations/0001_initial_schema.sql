-- VFT — initial schema for the WC 2026 prediction game.
-- Tables: teams, matches, predictions, points, profiles.
-- RLS: authenticated users read everything; users write only their own predictions/profile.

-- ============================================================
-- teams
-- ============================================================
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  group_letter text not null check (group_letter ~ '^[A-L]$'),
  flag_url text,
  api_team_id int unique,
  created_at timestamptz not null default now()
);

create index teams_group_idx on teams(group_letter);

-- ============================================================
-- matches
-- Knockout matches are pre-seeded with slot labels (e.g. "Vítěz skupiny A")
-- and team_ids are filled in as prior-round results come in.
-- ============================================================
create table matches (
  id uuid primary key default gen_random_uuid(),
  stage text not null check (stage in ('group', 'r32', 'r16', 'qf', 'sf', 'third_place', 'final')),
  home_team_id uuid references teams(id),
  away_team_id uuid references teams(id),
  home_slot_label text,
  away_slot_label text,
  kickoff_at timestamptz not null,
  home_score int check (home_score >= 0),
  away_score int check (away_score >= 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  api_match_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_team_or_slot_home check (home_team_id is not null or home_slot_label is not null),
  constraint matches_team_or_slot_away check (away_team_id is not null or away_slot_label is not null)
);

create index matches_stage_idx on matches(stage);
create index matches_kickoff_idx on matches(kickoff_at);
create index matches_status_idx on matches(status);

-- ============================================================
-- predictions
-- ============================================================
create table predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  predicted_home_team_id uuid references teams(id),
  predicted_away_team_id uuid references teams(id),
  home_score int not null check (home_score >= 0),
  away_score int not null check (away_score >= 0),
  submitted_at timestamptz not null default now(),
  locked boolean not null default false,
  unique (user_id, match_id)
);

create index predictions_user_idx on predictions(user_id);
create index predictions_match_idx on predictions(match_id);

-- ============================================================
-- points
-- Idempotent recompute keyed by (user_id, match_id, reason).
-- ============================================================
create table points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid references matches(id) on delete cascade,
  points int not null,
  reason text not null check (reason in (
    'exact_score', 'goal_difference', 'correct_result',
    'correct_advancement_r32', 'correct_advancement_r16',
    'correct_advancement_qf', 'correct_advancement_sf',
    'correct_advancement_final', 'correct_champion',
    'group_winner', 'correct_top2', 'correct_full_standings'
  )),
  context text,
  created_at timestamptz not null default now(),
  unique (user_id, match_id, reason, context)
);

create index points_user_idx on points(user_id);
create index points_match_idx on points(match_id);

-- ============================================================
-- profiles — display name etc. (one row per auth user)
-- ============================================================
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RLS
-- ============================================================
alter table teams enable row level security;
alter table matches enable row level security;
alter table predictions enable row level security;
alter table points enable row level security;
alter table profiles enable row level security;

-- Teams: authenticated users read; no client writes (service role only).
create policy teams_select on teams for select to authenticated using (true);

-- Matches: authenticated users read; no client writes (service role only).
create policy matches_select on matches for select to authenticated using (true);

-- Predictions: authenticated users read everything; insert/update only their own and only while not locked.
create policy predictions_select on predictions for select to authenticated using (true);
create policy predictions_insert_own on predictions for insert to authenticated
  with check (auth.uid() = user_id);
create policy predictions_update_own on predictions for update to authenticated
  using (auth.uid() = user_id and locked = false)
  with check (auth.uid() = user_id);

-- Points: authenticated users read; only service role writes.
create policy points_select on points for select to authenticated using (true);

-- Profiles: authenticated users read; users insert/update their own.
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_insert_own on profiles for insert to authenticated
  with check (auth.uid() = user_id);
create policy profiles_update_own on profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger matches_set_updated_at before update on matches
  for each row execute function set_updated_at();

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();
