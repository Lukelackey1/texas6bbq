// Pulls the latest posts from the Texas 6 Facebook Page into fb_posts.
// Runs hourly from pg_cron and on demand from the admin portal's "Sync now" button.
// Images are copied into Storage because Facebook's image links expire after a few days.
// Brand-new posts are also read for prices; anything found waits in the admin portal for approval.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { extractPrices, imageToBase64, NotConfigured } from './extract.ts';

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
    const message = 'Facebook is not connected yet. The site is showing the Facebook panel instead.';
    await log(false, message);
    return json({ ok: false, connected: false, message });
  }

  const fields = 'id,message,created_time,permalink_url,full_picture,attachments{media_type,media}';
  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/posts?fields=${encodeURIComponent(fields)}&limit=12&access_token=${encodeURIComponent(token)}`);
  const body = await res.json();
  if (!res.ok) {
    const message = `Facebook refused the request: ${body?.error?.message ?? res.status}`;
    await log(false, message);
    return json({ ok: false, connected: true, message }, 502);
  }

  let saved = 0, read = 0;
  const notes: string[] = [];
  for (const p of body.data ?? []) {
    const { data: existing } = await db.from('fb_posts').select('id,image_url').eq('id', p.id).maybeSingle();
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
    const att = p.attachments?.data?.[0];
    const kind = /video/.test(att?.media_type ?? '') ? 'video' : 'photo';
    const { error } = await db.from('fb_posts').upsert({
      id: p.id,
      message: p.message ?? '',
      created_time: p.created_time,
      permalink_url: p.permalink_url ?? null,
      image_url,
      media_kind: kind,
      media_w: att?.media?.image?.width ?? null,
      media_h: att?.media?.image?.height ?? null,
      synced_at: new Date().toISOString(),
    });
    if (!error) saved++;

    // Only brand-new posts are read, so each post is read once.
    if (!existing && !error) {
      try {
        const found = await extractPrices(p.message ?? '', image_url ? await imageToBase64(image_url) : null);
        if (found) {
          await db.from('price_suggestions').insert({ source: 'facebook', post_id: p.id, post_date: p.created_time, image_url, ...found });
          read++;
        }
      } catch (err) {
        if (!(err instanceof NotConfigured)) notes.push(String((err as Error).message ?? err));
      }
    }
  }

  let message = `Synced ${saved} post${saved === 1 ? '' : 's'} from Facebook.`;
  if (read) message += ` Found new prices in ${read} post${read === 1 ? '' : 's'}; review them on the Menu tab.`;
  if (notes.length) message += ` Price reading problem: ${notes[0]}`;
  await log(true, message);
  return json({ ok: true, connected: true, message, saved, read });
});
