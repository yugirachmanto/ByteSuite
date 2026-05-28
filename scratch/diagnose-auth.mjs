import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1].trim();

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log('Usage: node scratch/diagnose-auth.mjs <your-email> <your-password>');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  console.log('Signing in as:', email);
  const { data: { session }, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) { console.error('Sign in failed:', signInErr.message); process.exit(1); }
  console.log('Signed in. User ID:', session.user.id, '\n');

  // Check own profile
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).single();
  console.log('=== My profile ===');
  console.log(JSON.stringify(profile, null, 2));

  // All items visible to THIS user (with RLS active)
  const { data: items } = await supabase.from('item_master').select('id, name, org_id');
  console.log('\n=== item_master rows visible to me (RLS applied) ===');
  console.log('Count:', items?.length);
  const uniqueOrgs = [...new Set(items?.map(i => i.org_id))];
  console.log('Distinct org_ids in results:', uniqueOrgs);
  console.log('My org_id:', profile?.org_id);
  const crossOrg = items?.filter(i => i.org_id !== profile?.org_id);
  if (crossOrg?.length) {
    console.log('\n🚨 CROSS-ORG ITEMS FOUND:', crossOrg.length, 'items from other orgs!');
    console.log(JSON.stringify(crossOrg, null, 2));
  } else {
    console.log('\n✅ All visible items belong to my org.');
  }

  // Check what orgs exist
  const { data: orgs } = await supabase.from('organizations').select('id, name');
  console.log('\n=== Organizations visible to me ===');
  console.log(JSON.stringify(orgs, null, 2));

  await supabase.auth.signOut();
}

run();
