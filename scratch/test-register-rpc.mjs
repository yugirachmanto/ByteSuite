import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8');
const extractEnv = (key) => {
  const match = env.match(new RegExp('^' + key + '=(.*)$', 'm'));
  return match ? match[1].replace(/['"]/g, '').trim() : null;
};

const supabaseUrl = extractEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = extractEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
  const testUserId = '00000000-0000-0000-0000-000000000001';
  console.log('Calling register_new_org RPC with test user id:', testUserId);

  const { data, error } = await supabase.rpc('register_new_org', {
    p_user_id: testUserId,
    p_full_name: 'Test User',
    p_org_name: 'Test Org',
    p_outlet_name: 'Test Outlet'
  });

  console.log('Error:', error);
  console.log('Data:', data);
}

testRpc();
