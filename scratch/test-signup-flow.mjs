/**
 * Sign up a real test user and check what happens step by step
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8');
const extractEnv = (key) => {
  const match = env.match(new RegExp('^' + key + '=(.*)$', 'm'));
  return match ? match[1].replace(/['"]/g, '').trim() : null;
};

const supabaseUrl = extractEnv('NEXT_PUBLIC_SUPABASE_URL');
const anonKey = extractEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const supabase = createClient(supabaseUrl, anonKey);

async function test() {
  const testEmail = `test-${Date.now()}@debug.test`;
  const testPassword = 'password123';

  console.log('=== Step 1: Sign up ===');
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: { data: { full_name: 'Debug User' } },
  });

  console.log('Auth Error:', JSON.stringify(authError, null, 2));
  console.log('User ID:', authData?.user?.id);
  console.log('Has session:', !!authData?.session);

  if (authError || !authData?.user) {
    console.log('❌ Signup failed, stopping.');
    return;
  }

  const userId = authData.user.id;

  console.log('\n=== Step 2: Call register_new_org ===');
  const { data: rpcData, error: rpcError } = await supabase.rpc('register_new_org', {
    p_user_id: userId,
    p_full_name: 'Debug User',
    p_org_name: 'Debug Org',
    p_outlet_name: 'Debug Outlet',
  });

  console.log('RPC Error:', JSON.stringify(rpcError, null, 2));
  console.log('RPC Data:', rpcData);

  console.log('\n=== Step 3: Check profile exists ===');
  const { data: profile, error: pErr } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  console.log('Profile Error:', JSON.stringify(pErr, null, 2));
  console.log('Profile:', JSON.stringify(profile, null, 2));

  console.log('\n=== Step 4: Check organizations ===');
  const { data: orgs, error: oErr } = await supabase.from('organizations').select('*');
  console.log('Orgs Error:', oErr?.message || 'none');
  console.log('Orgs:', JSON.stringify(orgs, null, 2));

  // Sign out the test user
  await supabase.auth.signOut();
}

test();
