// Pulls the latest posts from the Texas 6 Facebook Page into fb_posts.
// Runs hourly from pg_cron and on demand from the admin portal's "Sync now" button.
// Images are copied into Storage because Facebook's image links expire after a few days.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const log = (ok: boolean, message: string) => db.from('sync_log').insert({ ok, message });

  const pageId = Deno.env.get('FB_PAGE_ID');
  const token = Deno.env.get('FB_PAGE_TOKEN');
  if (!pageId || !token) {
    const message = 'Facebook is not connected yet. The site is showing the Facebook feed widget instead.';
    await log(false, message);
    return json({ ok: false, connected: false, message });
  }

  const fields = 'id,message,created_time,permalink_url,full_picture';
  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/posts?fields=${fields}&limit=12&access_token=${encodeURIComponent(token)}`);
  const body = await res.json();
  if (!res.ok) {
    const message = `Facebook refused the request: ${body?.error?.message ?? res.status}`;
    await log(false, message);
    return json({ ok: false, connected: true, message }, 502);
  }

  let saved = 0;
  for (const p of body.data ?? []) {
    const { data: existing } = await db.from('fb_posts').select('image_url').eq('id', p.id).maybeSingle();
    let image_url: string | null = existing?.image_url ?? null;
    if (!image_url && p.full_picture) {
      const img = await fetch(p.full_picture);
      if (img.ok) {
        const path = `facebook/${p.id}.jpg`;
        const up = await db.storage.from('media').upload(path, await img.arrayBuffer(), {
          contentType: img.headers.get('content-type') ?? 'image/jpeg',
          upsert: true,
        });
        if (!up.error) image_url = db.storage.from('media').getPublicUrl(path).data.publicUrl;
      }
    }
    const { error } = await db.from('fb_posts').upsert({
      id: p.id,
      message: p.message ?? '',
      created_time: p.created_time,
      permalink_url: p.permalink_url ?? null,
      image_url,
      synced_at: new Date().toISOString(),
    });
    if (!error) saved++;
  }

  const message = `Synced ${saved} post${saved === 1 ? '' : 's'} from Facebook.`;
  await log(true, message);
  return json({ ok: true, connected: true, message, saved });
});
