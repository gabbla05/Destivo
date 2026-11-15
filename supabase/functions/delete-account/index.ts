/// <reference path="../transport-search/deno-shims.d.ts" />
/**
 * Edge Function: trwałe usunięcie konta zalogowanego użytkownika.
 *
 * 1. Sprawdza token z nagłówka Authorization (GET /auth/v1/user). Bez poprawnego tokenu -> 401,
 *    więc nie da się usunąć cudzego konta: identyfikator pochodzi wyłącznie z tokenu.
 * 2. Kluczem service_role (zmienna SUPABASE_SERVICE_ROLE_KEY, dostępna automatycznie w Supabase)
 *    usuwa wiersze użytkownika z tabeli `trips`.
 * 3. Usuwa użytkownika z Supabase Auth (DELETE /auth/v1/admin/users/{id}).
 *    Po tym ponowne logowanie tym samym e-mailem i hasłem się nie udaje.
 *
 * Wdrożenie: supabase functions deploy delete-account
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  // 1. Tożsamość wyłącznie z tokenu użytkownika
  const authHeader = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+/.test(authHeader)) return json({ error: 'unauthorized' }, 401);

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!userRes.ok) return json({ error: 'unauthorized' }, 401);
  const user = await userRes.json();
  const userId: string | undefined = user?.id;
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const adminHeaders = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    'Content-Type': 'application/json',
  };

  // 2. Dane użytkownika w bazie
  const tripsRes = await fetch(`${supabaseUrl}/rest/v1/trips?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  if (!tripsRes.ok) {
    return json({ error: 'trips_delete_failed', details: await tripsRes.text() }, 500);
  }

  // 3. Konto w Supabase Auth
  const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  if (!deleteRes.ok) {
    return json({ error: 'user_delete_failed', details: await deleteRes.text() }, 500);
  }

  return json({ deleted: true });
});
