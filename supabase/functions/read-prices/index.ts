// Admin-only: read prices from a synced Facebook post ({ post_id }) or an uploaded flyer
// ({ image_base64, media_type, text }) and save the result as a pending suggestion.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { extractPrices, imageToBase64, NotConfigured } from './extract.ts';

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

  const body = await req.json().catch(() => ({}));
  try {
    let text = '', image = null, row: Record<string, unknown> = {};
    if (body.post_id) {
      const { data: post } = await db.from('fb_posts').select('*').eq('id', body.post_id).maybeSingle();
      if (!post) return json({ error: 'That post isn’t synced.' }, 404);
      text = post.message ?? '';
      image = post.image_url ? await imageToBase64(post.image_url) : null;
      row = { source: 'facebook', post_id: post.id, post_date: post.created_time, image_url: post.image_url };
    } else if (body.image_base64) {
      text = String(body.text ?? '');
      image = { data: String(body.image_base64), media_type: String(body.media_type ?? 'image/jpeg') };
      row = { source: 'upload', image_url: body.image_url ?? null, post_date: new Date().toISOString() };
    } else {
      return json({ error: 'Send a post or a flyer image.' }, 400);
    }
    const found = await extractPrices(text, image);
    if (!found) return json({ ok: true, found: false, message: 'No prices found in that one.' });
    const { data, error } = await db.from('price_suggestions').insert({ ...row, ...found }).select().single();
    if (error) throw error;
    return json({ ok: true, found: true, suggestion: data, message: `Found ${found.items.length} prices. Review them on the Menu tab.` });
  } catch (err) {
    return json({ error: err instanceof NotConfigured ? err.message : String((err as Error).message ?? err) }, err instanceof NotConfigured ? 412 : 500);
  }
});
