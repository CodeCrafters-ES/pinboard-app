/**
 * Integration test — requires local Supabase running:
 *   npx supabase start
 *
 * Run with: npx jest --testPathPattern="integration" --no-coverage
 */
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7ACcShDMkTBHHAN4vqu6S25ULXF-V70J4fM';

const supabase = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY);

const TEST_EMAIL = `integration_test_${Date.now()}@nunibiza.com`;
const TEST_PASSWORD = 'IntegrationPass123!';

describe('updateOwnProfile integration', () => {
  let userId: string;

  beforeAll(async () => {
    const { data, error } = await supabase.auth.signUp({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (error) throw error;
    userId = data.user!.id;

    // Sign in to get authenticated session
    await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  });

  afterAll(async () => {
    await supabase.auth.signOut();
  });

  it('creates a profile row automatically via trigger on signup', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.user_id).toBe(userId);
    expect(data!.role).toBe('staff');
  });

  it('allows the user to update their own name and title', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ name: 'Integración', surname: 'Test', title: 'QA Engineer' })
      .eq('user_id', userId)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.name).toBe('Integración');
    expect(data!.surname).toBe('Test');
    expect(data!.title).toBe('QA Engineer');
  });

  it('does not allow the user to escalate their own role via direct update', async () => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'admin' } as never)
      .eq('user_id', userId);

    expect(error).not.toBeNull();
  });

  it('allows authenticated users to read all profiles', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('user_id', userId);

    expect(error).toBeNull();
    // SELECT policy is `using (true)`: any authenticated user sees all profiles.
    expect(data!.length).toBeGreaterThan(0);
  });
});
