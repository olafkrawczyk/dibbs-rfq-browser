create extension if not exists pg_trgm;

create table sync_runs (
  id            bigserial primary key,
  trigger       text not null check (trigger in ('scheduled', 'manual')),
  status        text not null check (status in ('queued', 'running', 'complete', 'partial', 'failed')),
  requested_at  timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  window_dates  date[] not null default '{}',
  days          jsonb not null default '[]',
  error         text
);

-- At most one active run, enforced by the database (spec §4.1).
create unique index sync_runs_one_active on sync_runs ((true)) where status in ('queued', 'running');
create index sync_runs_latest on sync_runs (id desc) where status in ('complete', 'partial', 'failed');

create table rfqs (
  id                  bigserial primary key,
  solicitation_number text not null,
  nsn                 text,
  part_number         text,
  item_key            text generated always as (coalesce(nsn, part_number)) stored,
  fsc                 text,
  nomenclature        text not null,
  item_name           text not null,
  mil_spec            boolean not null default false,
  quantity            integer,
  pr_number           text not null,
  status              text not null,
  status_raw          text not null,
  set_aside           text not null,
  set_aside_raw       text,
  tech_docs           text not null,
  posted_date         date not null,
  issue_date          date,
  return_by_date      date,
  dibbs_url           text not null,
  pdf_url             text,
  tech_docs_url       text,
  first_seen_at       timestamptz not null,
  first_seen_run_id   bigint not null,
  last_seen_at        timestamptz not null,
  last_sync_run_id    bigint not null,
  search_text         text generated always as (
                        solicitation_number || ' ' || coalesce(nsn, '') || ' ' ||
                        coalesce(part_number, '') || ' ' || pr_number || ' ' || nomenclature) stored,
  constraint rfqs_one_item_id check (num_nonnulls(nsn, part_number) = 1),
  constraint rfqs_identity unique (solicitation_number, item_key, pr_number)
);

create index rfqs_window_default on rfqs (posted_date desc, return_by_date, id);
create index rfqs_return_by on rfqs (return_by_date, id);
create index rfqs_quantity on rfqs (quantity, id);
create index rfqs_fsc on rfqs (fsc);
create index rfqs_item_name on rfqs (item_name);
create index rfqs_search_trgm on rfqs using gin (search_text gin_trgm_ops);

create table fsc_names (
  code       text primary key,
  name       text not null,
  updated_at timestamptz not null default now()
);
