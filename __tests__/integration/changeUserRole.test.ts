/**
 * Integration test — requires local Supabase running:
 *   npx supabase start
 *
 * Run with: npx jest --testPathPattern="changeUserRole" --no-coverage
 */
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7ACcShDMkTBHHAN4vqu6S25ULXF-V70J4fM';

const PASSWORD = 'TestPass123!';

describe('changeUserRole integration', () => {
  const TS = Date.now();
  const ADMIN_EMAIL = `cr_admin_${TS}@test.nunibiza.com`;
  const MANAGER_EMAIL = `cr_manager_${TS}@test.nunibiza.com`;
  const STAFF_EMAIL = `cr_staff_${TS}@test.nunibiza.com`;

  // Separate Supabase clients — each holds its own session
  const adminClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);
  const managerClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);
  const setupClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);

  let staffProfileId: string;

  beforeAll(async () => {
    // Create users via signUp — GoTrue stores the password; direct SQL inserts are not usable for signIn
    const { error: e1 } = await setupClient.auth.signUp({
      email: ADMIN_EMAIL,
      password: PASSWORD,
      options: { data: { role: 'admin' } },
    });
    if (e1) throw e1;

    const { error: e2 } = await setupClient.auth.signUp({
      email: MANAGER_EMAIL,
      password: PASSWORD,
      options: { data: { role: 'manager' } },
    });
    if (e2) throw e2;

    const { data: staffData, error: e3 } = await setupClient.auth.signUp({
      email: STAFF_EMAIL,
      password: PASSWORD,
    });
    if (e3) throw e3;
    const staffUserId = staffData.user!.id;

    // Sign in with dedicated clients
    const { error: adminSignIn } = await adminClient.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: PASSWORD,
    });
    if (adminSignIn) throw adminSignIn;

    const { error: managerSignIn } = await managerClient.auth.signInWithPassword({
      email: MANAGER_EMAIL,
      password: PASSWORD,
    });
    if (managerSignIn) throw managerSignIn;

    // Resolve staff profile.id (admin RLS can read any profile)
    const { data: profileData, error: profileErr } = await adminClient
      .from('profiles')
      .select('id')
      .eq('user_id', staffUserId)
      .single();
    if (profileErr || !profileData) throw profileErr ?? new Error('Staff profile not found');
    staffProfileId = profileData.id;
  });

  afterAll(async () => {
    await adminClient.auth.signOut();
    await managerClient.auth.signOut();
  });

  it('admin puede cambiar el rol de staff → manager', async () => {
    const { data, error } = await adminClient
      .from('profiles')
      .update({ role: 'manager' })
      .eq('id', staffProfileId)
      .select('role')
      .single();

    expect(error).toBeNull();
    expect(data?.role).toBe('manager');
  });

  it('manager no puede cambiar el rol de otro usuario (RLS bloquea, 0 filas)', async () => {
    const { data, error } = await managerClient
      .from('profiles')
      .update({ role: 'admin' } as never)
      .eq('id', staffProfileId)
      .select('role')
      .single();

    // USING policy filters the row → PostgREST returns 0 rows → PGRST116
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
