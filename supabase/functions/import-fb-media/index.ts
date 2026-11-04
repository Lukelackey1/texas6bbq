// Admin-only: copy a synced Facebook post's photo or video into the site's carousel.
// Videos are downloaded fresh from Facebook (their links expire) and stored in Supabase Storage.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user?.email) return json({ error: 'Sign in first.' }, 401);
  const { data: me } = await db.from('admins').select('email').ilike('email', user.email).maybeSingle();
  if (!me) return json({ error: 'This account is not an admin.' }, 403);

  const { post_id } = await req.json().catch(() => ({}));
  const { data: post } = await db.from('fb_posts').select('*').eq('id', post_id).maybeSingle();
  if (!post) return json({ error: 'That post isn’t synced.' }, 404);

  const { data: dup } = await db.from('media').select('id').eq('fb_post_id', post.id).maybeSingle();
  if (dup) return json({ error: 'That post is already in Photos & videos.' }, 409);

  const { data: last } = await db.from('media').select('sort').order('sort', { ascending: false }).limit(1).maybeSingle();
  const caption = (post.message ?? '').split('\n')[0].slice(0, 80);
  const row: Record<string, unknown> = {
    fb_post_id: post.id, caption, alt: caption, sort: (last?.sort ?? 0) + 1, active: true,
    width: post.media_w ?? 1200, height: post.media_h ?? 900,
  };

  if (post.media_kind === 'video') {
    const token = Deno.env.get('FB_PAGE_TOKEN');
    if (!token) return json({ error: 'Facebook isn’t connected, so videos can’t be copied yet.' }, 412);
    const r = await fetch(`https://graph.facebook.com/v21.0/${post.id}?fields=${encodeURIComponent('attachments{media{source,image}}')}&access_token=${encodeURIComponent(token)}`);
    const b = await r.json();
    const media = b?.attachments?.data?.[0]?.media;
    if (!media?.source) return json({ error: 'Facebook didn’t share a downloadable copy of that video.' }, 502);
    const vid = await fetch(media.source);
    if (!vid.ok) return json({ error: 'Couldn’t download the video from Facebook.' }, 502);
    const bytes = await vid.arrayBuffer();
    if (bytes.byteLength > 50 * 1024 * 1024) return json({ error: 'That video is over 50 MB, too big to add.' }, 413);
    const path = `facebook/${post.id}.mp4`;
    const up = await db.storage.from('media').upload(path, bytes, { contentType: 'video/mp4', upsert: true });
    if (up.error) return json({ error: up.error.message }, 500);
    Object.assign(row, {
      kind: 'video', url: db.storage.from('media').getPublicUrl(path).data.publicUrl, storage_path: path,
      poster_url: post.image_url, width: media.image?.width ?? row.width, height: media.image?.height ?? row.height,
    });
  } else {
    if (!post.image_url) return json({ error: 'That post has no photo.' }, 400);
    Object.assign(row, { kind: 'photo', url: post.image_url });
  }

  const { data, error } = await db.from('media').insert(row).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, media: data, message: 'Added to the end of Photos & videos.' });
});
