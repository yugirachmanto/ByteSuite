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

async function check() {
  console.log('--- Checking user_profiles ---');
  const { data: profiles, error: pErr } = await supabase.from('user_profiles').select('*');
  console.log('Error:', pErr);
  console.log('Profiles:', JSON.stringify(profiles, null, 2));

  console.log('\n--- Checking organizations ---');
  const { data: orgs, error: oErr } = await supabase.from('organizations').select('*');
  console.log('Error:', oErr);
  console.log('Orgs:', JSON.stringify(orgs, null, 2));

  console.log('\n--- Checking outlets ---');
  const { data: outlets, error: otErr } = await supabase.from('outlets').select('*');
  console.log('Error:', otErr);
  console.log('Outlets:', JSON.stringify(outlets, null, 2));
}

check();
