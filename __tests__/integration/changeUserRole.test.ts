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

const STAFF_USER_ID = 'aaaaaaaa-0000-0000-0000-000000000003';

describe('changeUserRole integration', () => {
  const adminClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);
  const managerClient = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);

  let staffProfileId: string;

  beforeAll(async () => {
    await adminClient.auth.signInWithPassword({
      email: 'admin@nun-ibiza.dev',
      password: 'password123',
    });
    await managerClient.auth.signInWithPassword({
      email: 'manager@nun-ibiza.dev',
      password: 'password123',
    });

    const { data } = await adminClient
      .from('profiles')
      .select('id')
      .eq('user_id', STAFF_USER_ID)
      .single();
    staffProfileId = data!.id;
  });

  afterAll(async () => {
    await adminClient
      .from('profiles')
      .update({ role: 'staff' })
      .eq('user_id', STAFF_USER_ID);

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

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
