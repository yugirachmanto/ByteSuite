/**
 * Deep diagnostic script - runs as service role to bypass RLS
 * Checks: auth.users, user_profiles, register_new_org function existence,
 * and whether the RPC actually succeeded/failed silently.
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
const serviceKey = extractEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!serviceKey) {
  console.log('⚠️  No SUPABASE_SERVICE_ROLE_KEY found in .env.local — using anon key (RLS will apply)');
}

const supabase = createClient(supabaseUrl, serviceKey || anonKey);

async function diagnose() {
  console.log('=== 1. user_profiles (all rows, no RLS) ===');
  const { data: profiles, error: pErr } = await supabase.from('user_profiles').select('*');
  console.log('Error:', pErr?.message || 'none');
  console.log('Count:', profiles?.length);
  console.log('Data:', JSON.stringify(profiles, null, 2));

  console.log('\n=== 2. organizations ===');
  const { data: orgs, error: oErr } = await supabase.from('organizations').select('*');
  console.log('Error:', oErr?.message || 'none');
  console.log('Data:', JSON.stringify(orgs, null, 2));

  console.log('\n=== 3. outlets ===');
  const { data: outlets, error: otErr } = await supabase.from('outlets').select('*');
  console.log('Error:', otErr?.message || 'none');
  console.log('Data:', JSON.stringify(outlets, null, 2));

  console.log('\n=== 4. Check register_new_org function exists ===');
  const { data: fn, error: fnErr } = await supabase
    .from('pg_proc')
    .select('proname')
    .eq('proname', 'register_new_org')
    .limit(1);
  // pg_proc not available via PostgREST — use rpc to test it instead
  console.log('(Using rpc call to verify function exists)');

  // Test calling the function with a non-existent UUID to see what error we get
  const { data: rpcData, error: rpcErr } = await supabase.rpc('register_new_org', {
    p_user_id: '00000000-0000-0000-0000-000000000099',
    p_full_name: 'Probe Test',
    p_org_name: 'Probe Org',
    p_outlet_name: 'Probe Outlet',
  });
  console.log('RPC Error:', JSON.stringify(rpcErr, null, 2));
  console.log('RPC Data:', rpcData);

  console.log('\n=== 5. Check item_master category constraint ===');
  const { data: items, error: iErr } = await supabase.from('item_master').select('id, name, category').limit(5);
  console.log('Error:', iErr?.message || 'none');
  console.log('Items:', JSON.stringify(items, null, 2));
}

diagnose();
