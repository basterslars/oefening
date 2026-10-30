-- AI Real Estate Designer — initieel datamodel
--
-- Gestructureerde tabellen voor projecten, plattegronden, ruimtes, muren,
-- openingen (deuren/ramen), ontwerpvarianten, 3D-objecten, media, AI-analyses,
-- exports en deellinks. Row Level Security zorgt dat gebruikers alleen hun
-- eigen projecten zien; delen gaat uitsluitend via een expliciete deellink.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- profielen
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  company text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- projecten
create table public.projects (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  property_type text not null default 'anders',
  address text not null default '',
  status text not null default 'concept' check (status in ('concept', 'in_bewerking', 'gereed', 'gepresenteerd')),
  furnishing text not null default 'leeg' check (furnishing in ('leeg', 'gedeeltelijk', 'gemeubileerd')),
  input_method text not null default 'manual' check (input_method in ('floorplan', 'manual', 'photo')),
  room_count integer,
  total_area numeric,
  total_area_source text,
  ceiling_height numeric not null default 2.6,
  ceiling_height_source text not null default 'default',
  thumbnail text,
  active_variant_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

create table public.floor_plans (
  project_id uuid primary key references public.projects (id) on delete cascade,
  background jsonb,
  updated_at timestamptz not null default now()
);

create table public.rooms (
  project_id uuid not null references public.projects (id) on delete cascade,
  id text not null,
  position integer not null default 0,
  name text not null,
  polygon jsonb not null,
  floor text not null,
  wall_color text not null,
  source text not null check (source in ('user', 'traced', 'ai_estimate', 'default')),
  primary key (project_id, id)
);

create table public.walls (
  project_id uuid not null references public.projects (id) on delete cascade,
  id text not null,
  position integer not null default 0,
  ax double precision not null,
  ay double precision not null,
  bx double precision not null,
  by double precision not null,
  thickness double precision not null,
  height double precision,
  color text,
  source text not null check (source in ('user', 'traced', 'ai_estimate', 'default')),
  primary key (project_id, id)
);

create table public.openings (
  project_id uuid not null references public.projects (id) on delete cascade,
  id text not null,
  wall_id text not null,
  type text not null check (type in ('door', 'window')),
  offset_m double precision not null,
  width double precision not null,
  height double precision not null,
  sill double precision not null default 0,
  swing smallint,
  source text not null check (source in ('user', 'traced', 'ai_estimate', 'default')),
  primary key (project_id, id),
  foreign key (project_id, wall_id) references public.walls (project_id, id) on delete cascade
);

create table public.design_variants (
  project_id uuid not null references public.projects (id) on delete cascade,
  id text not null,
  position integer not null default 0,
  name text not null,
  style text not null default '',
  description text,
  finishes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, id)
);

create table public.furniture_items (
  project_id uuid not null references public.projects (id) on delete cascade,
  variant_id text not null,
  id text not null,
  catalog_id text not null,
  x double precision not null,
  y double precision not null,
  rotation double precision not null default 0,
  elevation double precision not null default 0,
  color text not null,
  finish text not null,
  size jsonb,
  model_asset_id text,
  source text not null default 'user' check (source in ('user', 'ai_proposal')),
  primary key (project_id, variant_id, id),
  foreign key (project_id, variant_id) references public.design_variants (project_id, id) on delete cascade
);

create table public.media_assets (
  project_id uuid not null references public.projects (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('photo', 'floorplan', 'video', 'model', 'visualization')),
  name text not null,
  mime text not null,
  size bigint not null default 0,
  width integer,
  height integer,
  room_id text,
  storage_path text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, id)
);

create table public.visualizations (
  project_id uuid not null references public.projects (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('screenshot', 'before_after', 'staging')),
  title text not null,
  asset_id text not null,
  before_asset_id text,
  variant_id text,
  style text,
  origin text not null check (origin in ('render_3d', 'ai_image', 'uploaded')),
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (project_id, id)
);

create table public.ai_analyses (
  project_id uuid not null references public.projects (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('photo', 'floorplan', 'design')),
  asset_id text,
  provider text not null,
  model text not null,
  result jsonb not null,
  status text not null default 'pending' check (status in ('applied', 'pending', 'dismissed')),
  created_at timestamptz not null default now(),
  primary key (project_id, id)
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('pdf', 'csv', 'json', 'image')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  enabled boolean not null default true,
  expires_at timestamptz,
  passcode_hash text,
  allow_original_photos boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.floor_plans enable row level security;
alter table public.rooms enable row level security;
alter table public.walls enable row level security;
alter table public.openings enable row level security;
alter table public.design_variants enable row level security;
alter table public.furniture_items enable row level security;
alter table public.media_assets enable row level security;
alter table public.visualizations enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.exports enable row level security;
alter table public.project_shares enable row level security;

create policy "eigen profiel" on public.profiles
  for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "eigen projecten" on public.projects
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Hulpfunctie: is de ingelogde gebruiker eigenaar van dit project?
create or replace function public.owns_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.projects p where p.id = p_project and p.owner_id = (select auth.uid()));
$$;
revoke all on function public.owns_project(uuid) from public, anon;
grant execute on function public.owns_project(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['floor_plans', 'rooms', 'walls', 'openings', 'design_variants', 'furniture_items',
                           'media_assets', 'visualizations', 'ai_analyses', 'exports', 'project_shares']
  loop
    execute format(
      'create policy "eigenaar van project" on public.%I for all to authenticated
         using (public.owns_project(project_id)) with check (public.owns_project(project_id))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- document-API
-- De client werkt met één projectdocument (zie src/lib/types.ts). Deze functies
-- vertalen tussen dat document en de genormaliseerde tabellen, in één transactie.

create or replace function public.project_document(p_project uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'propertyType', p.property_type,
    'address', p.address,
    'status', p.status,
    'furnishing', p.furnishing,
    'inputMethod', p.input_method,
    'roomCount', p.room_count,
    'totalArea', case when p.total_area is null then null
                      else jsonb_build_object('value', p.total_area, 'source', coalesce(p.total_area_source, 'user')) end,
    'ceilingHeight', jsonb_build_object('value', p.ceiling_height, 'source', p.ceiling_height_source),
    'thumbnail', p.thumbnail,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at,
    'activeVariantId', p.active_variant_id,
    'schemaVersion', 1,
    'plan', jsonb_build_object(
      'background', (select fp.background from public.floor_plans fp where fp.project_id = p.id),
      'walls', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', w.id, 'a', jsonb_build_object('x', w.ax, 'y', w.ay), 'b', jsonb_build_object('x', w.bx, 'y', w.by),
          'thickness', w.thickness, 'height', w.height, 'color', w.color, 'source', w.source)) order by w.position)
        from public.walls w where w.project_id = p.id), '[]'::jsonb),
      'openings', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', o.id, 'wallId', o.wall_id, 'type', o.type, 'offset', o.offset_m, 'width', o.width,
          'height', o.height, 'sill', o.sill, 'swing', o.swing, 'source', o.source)) order by o.id)
        from public.openings o where o.project_id = p.id), '[]'::jsonb),
      'rooms', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r.id, 'name', r.name, 'polygon', r.polygon, 'floor', r.floor, 'wallColor', r.wall_color,
          'source', r.source) order by r.position)
        from public.rooms r where r.project_id = p.id), '[]'::jsonb)
    ),
    'variants', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', v.id, 'name', v.name, 'style', v.style, 'description', v.description, 'finishes', v.finishes,
        'createdAt', v.created_at, 'updatedAt', v.updated_at,
        'furniture', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'id', f.id, 'catalogId', f.catalog_id, 'x', f.x, 'y', f.y, 'rotation', f.rotation,
            'elevation', f.elevation, 'color', f.color, 'finish', f.finish, 'size', f.size,
            'modelAssetId', f.model_asset_id, 'source', f.source)) order by f.id)
          from public.furniture_items f where f.project_id = p.id and f.variant_id = v.id), '[]'::jsonb)
      )) order by v.position)
      from public.design_variants v where v.project_id = p.id), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'name', m.name, 'mime', m.mime, 'size', m.size, 'width', m.width,
        'height', m.height, 'roomId', m.room_id, 'createdAt', m.created_at)) order by m.created_at)
      from public.media_assets m where m.project_id = p.id), '[]'::jsonb),
    'visualizations', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', z.id, 'kind', z.kind, 'title', z.title, 'assetId', z.asset_id, 'beforeAssetId', z.before_asset_id,
        'variantId', z.variant_id, 'style', z.style, 'origin', z.origin, 'favorite', z.favorite, 'createdAt', z.created_at)) order by z.created_at)
      from public.visualizations z where z.project_id = p.id), '[]'::jsonb),
    'analyses', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', a.id, 'kind', a.kind, 'assetId', a.asset_id, 'provider', a.provider, 'model', a.model,
        'result', a.result, 'status', a.status, 'createdAt', a.created_at)) order by a.created_at)
      from public.ai_analyses a where a.project_id = p.id), '[]'::jsonb)
  )
  from public.projects p
  where p.id = p_project;
$$;

create or replace function public.save_project(doc jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pid uuid := (doc ->> 'id')::uuid;
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  insert into public.projects as p (id, owner_id, name, property_type, address, status, furnishing, input_method,
    room_count, total_area, total_area_source, ceiling_height, ceiling_height_source, thumbnail, active_variant_id,
    created_at, updated_at)
  values (pid, uid, doc ->> 'name', doc ->> 'propertyType', coalesce(doc ->> 'address', ''), doc ->> 'status',
    doc ->> 'furnishing', doc ->> 'inputMethod', (doc ->> 'roomCount')::integer,
    (doc #>> '{totalArea,value}')::numeric, doc #>> '{totalArea,source}',
    coalesce((doc #>> '{ceilingHeight,value}')::numeric, 2.6), coalesce(doc #>> '{ceilingHeight,source}', 'default'),
    doc ->> 'thumbnail', doc ->> 'activeVariantId',
    coalesce((doc ->> 'createdAt')::timestamptz, now()), coalesce((doc ->> 'updatedAt')::timestamptz, now()))
  on conflict (id) do update set
    name = excluded.name, property_type = excluded.property_type, address = excluded.address,
    status = excluded.status, furnishing = excluded.furnishing, input_method = excluded.input_method,
    room_count = excluded.room_count, total_area = excluded.total_area, total_area_source = excluded.total_area_source,
    ceiling_height = excluded.ceiling_height, ceiling_height_source = excluded.ceiling_height_source,
    thumbnail = excluded.thumbnail, active_variant_id = excluded.active_variant_id, updated_at = excluded.updated_at
  where p.owner_id = uid;

  if not found then
    raise exception 'Geen toegang tot project %', pid using errcode = '42501';
  end if;

  insert into public.floor_plans (project_id, background, updated_at)
  values (pid, doc #> '{plan,background}', now())
  on conflict (project_id) do update set background = excluded.background, updated_at = now();

  -- Kindtabellen worden volledig vervangen door de inhoud van het document.
  delete from public.openings where project_id = pid;
  delete from public.walls where project_id = pid;
  delete from public.rooms where project_id = pid;
  delete from public.furniture_items where project_id = pid;
  delete from public.design_variants where project_id = pid;
  delete from public.media_assets where project_id = pid;
  delete from public.visualizations where project_id = pid;
  delete from public.ai_analyses where project_id = pid;

  insert into public.walls (project_id, id, position, ax, ay, bx, by, thickness, height, color, source)
  select pid, w ->> 'id', (ord - 1)::integer, (w #>> '{a,x}')::float8, (w #>> '{a,y}')::float8,
    (w #>> '{b,x}')::float8, (w #>> '{b,y}')::float8, (w ->> 'thickness')::float8, (w ->> 'height')::float8,
    w ->> 'color', w ->> 'source'
  from jsonb_array_elements(coalesce(doc #> '{plan,walls}', '[]'::jsonb)) with ordinality as t(w, ord);

  insert into public.openings (project_id, id, wall_id, type, offset_m, width, height, sill, swing, source)
  select pid, o ->> 'id', o ->> 'wallId', o ->> 'type', (o ->> 'offset')::float8, (o ->> 'width')::float8,
    (o ->> 'height')::float8, coalesce((o ->> 'sill')::float8, 0), (o ->> 'swing')::smallint, o ->> 'source'
  from jsonb_array_elements(coalesce(doc #> '{plan,openings}', '[]'::jsonb)) as t(o);

  insert into public.rooms (project_id, id, position, name, polygon, floor, wall_color, source)
  select pid, r ->> 'id', (ord - 1)::integer, r ->> 'name', r -> 'polygon', r ->> 'floor', r ->> 'wallColor', r ->> 'source'
  from jsonb_array_elements(coalesce(doc #> '{plan,rooms}', '[]'::jsonb)) with ordinality as t(r, ord);

  insert into public.design_variants (project_id, id, position, name, style, description, finishes, created_at, updated_at)
  select pid, v ->> 'id', (ord - 1)::integer, v ->> 'name', coalesce(v ->> 'style', ''), v ->> 'description',
    coalesce(v -> 'finishes', '{}'::jsonb), coalesce((v ->> 'createdAt')::timestamptz, now()),
    coalesce((v ->> 'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(doc -> 'variants', '[]'::jsonb)) with ordinality as t(v, ord);

  insert into public.furniture_items (project_id, variant_id, id, catalog_id, x, y, rotation, elevation, color, finish,
    size, model_asset_id, source)
  select pid, v ->> 'id', f ->> 'id', f ->> 'catalogId', (f ->> 'x')::float8, (f ->> 'y')::float8,
    coalesce((f ->> 'rotation')::float8, 0), coalesce((f ->> 'elevation')::float8, 0), f ->> 'color', f ->> 'finish',
    f -> 'size', f ->> 'modelAssetId', coalesce(f ->> 'source', 'user')
  from jsonb_array_elements(coalesce(doc -> 'variants', '[]'::jsonb)) as tv(v),
       jsonb_array_elements(coalesce(v -> 'furniture', '[]'::jsonb)) as tf(f);

  insert into public.media_assets (project_id, id, kind, name, mime, size, width, height, room_id, storage_path, created_at)
  select pid, m ->> 'id', m ->> 'kind', m ->> 'name', m ->> 'mime', coalesce((m ->> 'size')::bigint, 0),
    (m ->> 'width')::integer, (m ->> 'height')::integer, m ->> 'roomId',
    uid::text || '/' || pid::text || '/' || (m ->> 'id'), coalesce((m ->> 'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(doc -> 'media', '[]'::jsonb)) as t(m);

  insert into public.visualizations (project_id, id, kind, title, asset_id, before_asset_id, variant_id, style, origin, favorite, created_at)
  select pid, z ->> 'id', z ->> 'kind', z ->> 'title', z ->> 'assetId', z ->> 'beforeAssetId', z ->> 'variantId',
    z ->> 'style', z ->> 'origin', coalesce((z ->> 'favorite')::boolean, false), coalesce((z ->> 'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(doc -> 'visualizations', '[]'::jsonb)) as t(z);

  insert into public.ai_analyses (project_id, id, kind, asset_id, provider, model, result, status, created_at)
  select pid, a ->> 'id', a ->> 'kind', a ->> 'assetId', a ->> 'provider', a ->> 'model', coalesce(a -> 'result', 'null'::jsonb),
    coalesce(a ->> 'status', 'pending'), coalesce((a ->> 'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(doc -> 'analyses', '[]'::jsonb)) as t(a);
end;
$$;
revoke all on function public.save_project(jsonb) from public, anon;
grant execute on function public.save_project(jsonb) to authenticated;
revoke all on function public.project_document(uuid) from public, anon;
grant execute on function public.project_document(uuid) to authenticated;

-- ---------------------------------------------------------------- delen
-- Alleen voor de server-route /api/share/[token] (service role). Controleert
-- of de link actief en niet verlopen is en of de toegangscode klopt.
create or replace function public.resolve_share(p_token text, p_passcode text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.project_shares;
  doc jsonb;
  owner uuid;
begin
  select * into s from public.project_shares where token = p_token;
  if not found or not s.enabled or (s.expires_at is not null and s.expires_at < now()) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if s.passcode_hash is not null then
    if p_passcode is null or extensions.crypt(p_passcode, s.passcode_hash) <> s.passcode_hash then
      return jsonb_build_object('status', 'passcode_required');
    end if;
  end if;
  doc := public.project_document(s.project_id);
  select owner_id into owner from public.projects where id = s.project_id;
  if not s.allow_original_photos then
    doc := jsonb_set(doc, '{media}', coalesce((select jsonb_agg(m) from jsonb_array_elements(doc -> 'media') m
      where m ->> 'kind' not in ('photo', 'video')), '[]'::jsonb));
  end if;
  return jsonb_build_object('status', 'ok', 'project', doc, 'storagePrefix', owner::text || '/' || s.project_id::text,
    'expiresAt', s.expires_at);
end;
$$;
revoke all on function public.resolve_share(text, text) from public, anon, authenticated;
grant execute on function public.resolve_share(text, text) to service_role;

-- Eigenaar stelt een toegangscode in (gehasht opgeslagen)
create or replace function public.set_share_passcode(p_share uuid, p_passcode text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.project_shares
     set passcode_hash = case when p_passcode is null or p_passcode = '' then null
                              else extensions.crypt(p_passcode, extensions.gen_salt('bf')) end
   where id = p_share;
end;
$$;
revoke all on function public.set_share_passcode(uuid, text) from public, anon;
grant execute on function public.set_share_passcode(uuid, text) to authenticated;

-- ---------------------------------------------------------------- opslag
insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', false)
on conflict (id) do nothing;

create policy "eigen media lezen" on storage.objects for select to authenticated
  using (bucket_id = 'project-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "eigen media schrijven" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "eigen media wijzigen" on storage.objects for update to authenticated
  using (bucket_id = 'project-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "eigen media verwijderen" on storage.objects for delete to authenticated
  using (bucket_id = 'project-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
