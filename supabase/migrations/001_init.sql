-- Texas 6 BBQ: content tables, admin access, media storage, Facebook post cache.

-- Who may edit. Rows are added through the manage-admins edge function.
create table if not exists public.admins (
  email text primary key,
  added_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- Editable words on the site, keyed by the data-edit attribute in index.html.
create table if not exists public.site_text (
  key text primary key,
  value text not null default '',
  label text not null,
  section text not null,
  sort int not null default 0,
  multiline boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Catering menu. Meats use whole / half / per-lb; sides use whole_price as the pan price.
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('meat', 'side')),
  name text not null,
  whole_price numeric(8,2),
  whole_note text not null default '',
  half_price numeric(8,2),
  half_note text not null default '',
  lb_price numeric(8,2),
  sort int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Photos and videos in the home page carousel.
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('photo', 'video')),
  url text not null,
  poster_url text,
  caption text not null default '',
  alt text not null default '',
  width int,
  height int,
  storage_path text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Posts pulled from the Texas 6 Facebook Page by the fb-sync function.
create table if not exists public.fb_posts (
  id text primary key,
  message text not null default '',
  created_time timestamptz not null,
  permalink_url text,
  image_url text,
  hidden boolean not null default false,
  synced_at timestamptz not null default now()
);

create table if not exists public.sync_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  message text not null default ''
);

-- Row level security: everyone can read what the site shows; only admins write.
alter table public.admins enable row level security;
alter table public.site_text enable row level security;
alter table public.menu_items enable row level security;
alter table public.media enable row level security;
alter table public.fb_posts enable row level security;
alter table public.sync_log enable row level security;

create policy "admins read admins" on public.admins for select using (public.is_admin());

create policy "public read text" on public.site_text for select using (true);
create policy "admin write text" on public.site_text for all using (public.is_admin()) with check (public.is_admin());

create policy "public read menu" on public.menu_items for select using (active or public.is_admin());
create policy "admin write menu" on public.menu_items for all using (public.is_admin()) with check (public.is_admin());

create policy "public read media" on public.media for select using (active or public.is_admin());
create policy "admin write media" on public.media for all using (public.is_admin()) with check (public.is_admin());

create policy "public read posts" on public.fb_posts for select using (not hidden or public.is_admin());
create policy "admin write posts" on public.fb_posts for update using (public.is_admin()) with check (public.is_admin());

create policy "admins read log" on public.sync_log for select using (public.is_admin());

-- Public media bucket: anyone can view, admins upload and delete.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do nothing;

create policy "public read media files" on storage.objects for select using (bucket_id = 'media');
create policy "admin upload media files" on storage.objects for insert with check (bucket_id = 'media' and public.is_admin());
create policy "admin update media files" on storage.objects for update using (bucket_id = 'media' and public.is_admin());
create policy "admin delete media files" on storage.objects for delete using (bucket_id = 'media' and public.is_admin());

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger site_text_touch before update on public.site_text for each row execute function public.touch_updated_at();
create trigger menu_items_touch before update on public.menu_items for each row execute function public.touch_updated_at();
