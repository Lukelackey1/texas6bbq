// Lets a signed-in admin list, add and remove admins, and set someone's password.
// Creating logins needs the service role key, which must never reach the browser, so it lives here.
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
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { data: { user } } = await caller.auth.getUser();
  if (!user?.email) return json({ error: 'Sign in first.' }, 401);
  const { data: me } = await admin.from('admins').select('email').ilike('email', user.email).maybeSingle();
  if (!me) return json({ error: 'This account is not an admin.' }, 403);

  const { action, email: rawEmail, password } = await req.json().catch(() => ({}));
  const email = String(rawEmail ?? '').trim().toLowerCase();

  const findUser = async (e: string) => {
    for (let page = 1; page < 20; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const hit = data.users.find((u) => u.email?.toLowerCase() === e);
      if (hit || data.users.length < 200) return hit ?? null;
    }
    return null;
  };

  if (action === 'list') {
    const { data } = await admin.from('admins').select('email, added_at').order('added_at');
    return json({ admins: data ?? [], me: user.email.toLowerCase() });
  }

  if (!email || !email.includes('@')) return json({ error: 'Enter an email address.' }, 400);

  if (action === 'add') {
    if (!password || String(password).length < 8) return json({ error: 'Choose a password of at least 8 characters.' }, 400);
    const existing = await findUser(email);
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    } else {
      const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return json({ error: error.message }, 400);
    }
    await admin.from('admins').upsert({ email });
    return json({ ok: true, message: `${email} can now sign in.` });
  }

  if (action === 'remove') {
    if (email === user.email.toLowerCase()) return json({ error: 'You can’t remove yourself.' }, 400);
    await admin.from('admins').delete().ilike('email', email);
    return json({ ok: true, message: `${email} no longer has admin access.` });
  }

  if (action === 'password') {
    if (!password || String(password).length < 8) return json({ error: 'Choose a password of at least 8 characters.' }, 400);
    const u = await findUser(email);
    if (!u) return json({ error: 'No login exists for that email.' }, 404);
    await admin.auth.admin.updateUserById(u.id, { password });
    return json({ ok: true, message: `Password updated for ${email}.` });
  }

  return json({ error: 'Unknown action.' }, 400);
});
