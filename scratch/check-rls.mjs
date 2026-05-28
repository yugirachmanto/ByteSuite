/**
 * Check if RLS policies are actually active on item_master and chart_of_accounts
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8');
const extractEnv = (key) => {
  const match = env.match(new RegExp('^' + key + '=(.*)$', 'm'));
  return match ? match[1].replace(/['"]/g, '').trim() : null;
};

const supabaseUrl = extractEnv('NEXT_PUBLIC_SUPABASE_URL');
const serviceKey = extractEnv('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = extractEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

if (!serviceKey) {
  console.log('⚠️  No service role key — using anon key, RLS will apply\n');
}

// Service role bypasses RLS — shows everything
const admin = createClient(supabaseUrl, serviceKey || anonKey);

async function check() {
  console.log('=== All item_master rows (bypassing RLS) ===');
  const { data: items, error: iErr } = await admin.from('item_master').select('id, name, org_id');
  console.log('Error:', iErr?.message || 'none');
  console.log('Total items:', items?.length);
  const orgs = [...new Set(items?.map(i => i.org_id))];
  console.log('Distinct org_ids:', orgs);
  
  console.log('\n=== All user_profiles ===');
  const { data: profiles } = await admin.from('user_profiles').select('id, org_id, full_name, role');
  console.log('Profiles:', JSON.stringify(profiles, null, 2));

  console.log('\n=== All organizations ===');
  const { data: orgsData } = await admin.from('organizations').select('*');
  console.log('Orgs:', JSON.stringify(orgsData, null, 2));
}

check();
