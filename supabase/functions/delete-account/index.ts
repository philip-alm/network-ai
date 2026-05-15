// delete-account — fully deletes the caller's user account + all owned rows.
//
// Required by Apple's Guideline 5.1.1(v): in-app account deletion. Even
// before iOS shipping, GDPR-style "delete me" is good practice.
//
// Auth: caller's JWT identifies the user. We use the service-role to call
// `auth.admin.deleteUser`, which cascades to every owner-scoped row via
// `auth.users.id ON DELETE CASCADE`.

import { Hono } from 'jsr:@hono/hono@^4.7';
import { cors } from 'jsr:@hono/hono@^4.7/cors';
import { createClient } from 'jsr:@supabase/supabase-js@^2.50';

const app = new Hono().basePath('/delete-account');

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'apikey', 'x-client-info'],
    maxAge: 600,
  }),
);

app.post('/', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth) return c.text('Missing Authorization header', 401);
  const token = auth.replace(/^Bearer\s+/i, '');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return c.text('delete-account: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', 500);
  }

  // Identify the caller by validating their JWT.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData.user) return c.text('Invalid token', 401);
  const userId = userData.user.id;

  // Delete via service role. Cascades to contacts/assets/chat_* via FK on delete.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    return c.json({ error: delErr.message }, 500);
  }

  return c.json({ ok: true, deletedUserId: userId });
});

app.get('/health', (c) => c.json({ ok: true }));

Deno.serve(app.fetch);
