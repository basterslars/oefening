-- ════════════════════════════════════════════════════════════════════════════
-- Personal AI Study Assistant — initieel schema
-- Alle tabellen zijn per gebruiker afgeschermd met Row Level Security (RLS):
-- de app gebruikt uitsluitend de sessie van de ingelogde gebruiker, nooit de
-- service-role key. Hierdoor kan een gebruiker alleen eigen data lezen/schrijven.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists vector with schema extensions;

-- ── Profielen ───────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  study_level text not null default 'bachelor'
    check (study_level in ('hbo', 'bachelor', 'premaster', 'master')),
  -- ISO-weekdagen waarop gestudeerd wordt (1 = maandag … 7 = zondag)
  study_days smallint[] not null default '{1,2,3,4,5,6}',
  daily_goal_minutes integer not null default 120 check (daily_goal_minutes between 0 and 960),
  plan_generated_on date,
  plan_warnings jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Vakken ──────────────────────────────────────────────────────────────────
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 1000),
  color text not null default 'slate',
  exam_date date,
  material_pages integer check (material_pages between 0 and 20000),
  estimated_hours numeric(6, 1) check (estimated_hours between 0 and 2000),
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  knowledge_level smallint not null default 1 check (knowledge_level between 1 and 5),
  hours_per_week numeric(4, 1) not null default 6 check (hours_per_week between 0 and 80),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_user_idx on public.courses (user_id);

-- ── Documenten en tekstfragmenten ───────────────────────────────────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  file_type text not null check (file_type in ('pdf', 'docx', 'pptx', 'xlsx', 'txt', 'md', 'csv')),
  category text not null default 'overig',
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'ready', 'error')),
  error text,
  page_count integer,
  word_count integer,
  chunk_count integer,
  summary text,
  key_terms jsonb not null default '[]',
  topics text[] not null default '{}',
  analyzed_by text check (analyzed_by in ('local', 'ai')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index documents_course_idx on public.documents (course_id);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  chunk_index integer not null,
  location text,
  heading text,
  content text not null,
  -- 'simple' = taalonafhankelijk (geen stemming), werkt voor Nederlands én Engels materiaal
  tsv tsvector generated always as (
    to_tsvector('simple', coalesce(heading, '') || ' ' || content)
  ) stored,
  -- Optioneel: alleen gevuld als EMBEDDING_PROVIDER is geconfigureerd (voyage-3.5 → 1024 dimensies)
  embedding extensions.vector(1024),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index document_chunks_course_idx on public.document_chunks (course_id);
create index document_chunks_tsv_idx on public.document_chunks using gin (tsv);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- ── Onderwerpen + beheersing ────────────────────────────────────────────────
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  -- Beheersing 0..1, bijgewerkt na tentamenvragen en flashcard-herhalingen
  mastery real not null default 0 check (mastery between 0 and 1),
  attempts integer not null default 0,
  correct numeric(8, 2) not null default 0,
  last_studied_at timestamptz,
  source text not null default 'manual' check (source in ('ai', 'manual')),
  created_at timestamptz not null default now()
);
create unique index topics_course_name_idx on public.topics (course_id, lower(name));

-- ── AI-docent ───────────────────────────────────────────────────────────────
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  mode text not null default 'explain' check (mode in ('explain', 'exam', 'practice', 'quick')),
  title text not null default 'Nieuw gesprek',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_sessions_user_idx on public.chat_sessions (user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index chat_messages_session_idx on public.chat_messages (session_id, created_at);

-- ── Oefententamens ──────────────────────────────────────────────────────────
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  settings jsonb not null default '{}',
  status text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  time_limit_minutes integer check (time_limit_minutes between 1 and 600),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score numeric(8, 2),
  max_score numeric(8, 2),
  report jsonb,
  created_at timestamptz not null default now()
);
create index exams_user_idx on public.exams (user_id, created_at desc);

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  position integer not null,
  type text not null check (type in ('mc', 'open', 'case', 'calculation', 'concept', 'application')),
  topic_id uuid references public.topics (id) on delete set null,
  topic_name text,
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  prompt text not null,
  options jsonb,
  correct_answer text not null,
  explanation text,
  rubric text,
  sources jsonb not null default '[]',
  max_points numeric(5, 2) not null default 1,
  user_answer text,
  points numeric(5, 2),
  feedback text,
  misconception text,
  answered_at timestamptz,
  unique (exam_id, position)
);

-- ── Flashcards (FSRS spaced repetition) ─────────────────────────────────────
create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  front text not null check (char_length(front) between 1 and 2000),
  back text not null check (char_length(back) between 1 and 4000),
  card_type text not null default 'begrip'
    check (card_type in ('begrip', 'definitie', 'theorie', 'formule', 'overig')),
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  source_location text,
  origin text not null default 'manual' check (origin in ('ai', 'manual')),
  -- FSRS-toestand (ts-fsrs Card), due/state ook als kolom voor snelle queries
  fsrs jsonb,
  due timestamptz not null default now(),
  state smallint not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  last_review timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index flashcards_due_idx on public.flashcards (user_id, due);
create index flashcards_course_idx on public.flashcards (course_id);

create table public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.flashcards (id) on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  state_before smallint,
  elapsed_ms integer,
  reviewed_at timestamptz not null default now()
);
create index flashcard_reviews_user_idx on public.flashcard_reviews (user_id, reviewed_at desc);

-- ── Studietijd, planning, coach ─────────────────────────────────────────────
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  activity text not null check (activity in ('tutor', 'exam', 'flashcards', 'reading', 'planner', 'other')),
  minutes numeric(6, 1) not null check (minutes > 0 and minutes <= 720),
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now(),
  source_id uuid,
  note text check (char_length(note) <= 500)
);
create index study_sessions_user_idx on public.study_sessions (user_id, started_at desc);
create index study_sessions_source_idx on public.study_sessions (source_id);

create table public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  date date not null,
  minutes integer not null check (minutes between 5 and 600),
  kind text not null check (kind in ('learn', 'review', 'practice', 'final_review')),
  title text not null,
  topic_id uuid references public.topics (id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index plan_sessions_user_date_idx on public.plan_sessions (user_id, date);

create table public.coach_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content text not null,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.profiles enable row level security;
create policy profiles_own on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'courses', 'documents', 'document_chunks', 'topics', 'chat_sessions', 'chat_messages',
    'exams', 'exam_questions', 'flashcards', 'flashcard_reviews', 'study_sessions',
    'plan_sessions', 'coach_reviews', 'ai_usage'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_own', t
    );
  end loop;
end $$;

-- Kindrecords mogen alleen aan een eigen vak gekoppeld worden.
create or replace function public.owns_course(p_course_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.courses c where c.id = p_course_id and c.user_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['documents', 'document_chunks', 'topics', 'exams', 'flashcards', 'plan_sessions'] loop
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.owns_course(course_id))',
      t || '_course_owned', t
    );
  end loop;
end $$;

-- ── Hybride zoeken (full-text + optioneel vector) met Reciprocal Rank Fusion ─
-- security invoker: RLS blijft van toepassing, je doorzoekt alleen eigen fragmenten.
create or replace function public.search_chunks(
  p_query text,
  p_course_id uuid default null,
  p_embedding extensions.vector(1024) default null,
  p_limit integer default 8,
  p_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  document_name text,
  course_id uuid,
  location text,
  heading text,
  content text,
  score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select case when coalesce(p_query, '') = '' then null else to_tsquery('simple', p_query) end as tsq
  ),
  fts as (
    select c.id, row_number() over (order by ts_rank_cd(c.tsv, q.tsq) desc) as rnk
    from public.document_chunks c, q
    where q.tsq is not null
      and c.tsv @@ q.tsq
      and (p_course_id is null or c.course_id = p_course_id)
      and (p_document_ids is null or c.document_id = any (p_document_ids))
    order by rnk
    limit 50
  ),
  vec as (
    select c.id, row_number() over (order by c.embedding <=> p_embedding) as rnk
    from public.document_chunks c
    where p_embedding is not null
      and c.embedding is not null
      and (p_course_id is null or c.course_id = p_course_id)
      and (p_document_ids is null or c.document_id = any (p_document_ids))
    order by c.embedding <=> p_embedding
    limit 50
  ),
  fused as (
    select coalesce(f.id, v.id) as id,
           coalesce(1.0 / (60 + f.rnk), 0) + coalesce(1.0 / (60 + v.rnk), 0) as score
    from fts f
    full outer join vec v on v.id = f.id
  )
  select c.id, c.document_id, d.name, c.course_id, c.location, c.heading, c.content, fused.score::double precision
  from fused
  join public.document_chunks c on c.id = fused.id
  join public.documents d on d.id = c.document_id
  order by fused.score desc, c.chunk_index
  limit greatest(1, least(p_limit, 50));
$$;

-- ── Opslag voor studiedocumenten (privé bucket, map per gebruiker) ──────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

create policy documents_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy documents_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy documents_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy documents_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Aggregaties (in de database, want PostgREST levert max. 1000 rijen) ─────
create or replace function public.study_totals()
returns table (course_id uuid, minutes double precision, sessions bigint)
language sql stable security invoker set search_path = '' as $$
  select s.course_id, sum(s.minutes)::double precision, count(*)
  from public.study_sessions s
  where s.user_id = auth.uid()
  group by s.course_id;
$$;

create or replace function public.study_daily(p_since date, p_tz text default 'Europe/Amsterdam')
returns table (day date, course_id uuid, activity text, minutes double precision)
language sql stable security invoker set search_path = '' as $$
  select (s.started_at at time zone p_tz)::date as day, s.course_id, s.activity, sum(s.minutes)::double precision
  from public.study_sessions s
  where s.user_id = auth.uid() and (s.started_at at time zone p_tz)::date >= p_since
  group by 1, 2, 3
  order by 1;
$$;

create or replace function public.flashcard_counts()
returns table (course_id uuid, total bigint, due bigint, new_cards bigint)
language sql stable security invoker set search_path = '' as $$
  select f.course_id, count(*), count(*) filter (where f.due <= now()), count(*) filter (where f.state = 0)
  from public.flashcards f
  where f.user_id = auth.uid()
  group by f.course_id;
$$;
