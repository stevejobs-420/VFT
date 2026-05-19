-- Adds a stable match_key (M1..M104) to every match. Used by the predict
-- knockout UI and (later) the points engine to reference specific bracket
-- positions without re-deriving from kickoff order at runtime.
--
-- The backfill orders rows by (stage_rank, kickoff_at, api_match_id) so the
-- resulting M-numbers match FIFA's bracket numbering: M1..M72 group stage in
-- chronological order, M73..M88 R32, M89..M96 R16, M97..M100 QF, M101..M102
-- SF, M103 third-place playoff (excluded from predictions), M104 final.

alter table matches add column match_key text;

with ranked as (
  select
    id,
    'M' || row_number() over (
      order by
        case stage
          when 'group' then 1
          when 'r32' then 2
          when 'r16' then 3
          when 'qf' then 4
          when 'sf' then 5
          when 'third_place' then 6
          when 'final' then 7
        end,
        kickoff_at,
        api_match_id
    ) as new_key
  from matches
)
update matches m set match_key = r.new_key from ranked r where r.id = m.id;

alter table matches alter column match_key set not null;
alter table matches add constraint matches_match_key_unique unique (match_key);
create index matches_match_key_idx on matches(match_key);
