import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8');
const extractEnv = (key) => {
  const match = env.match(new RegExp('^' + key + '=(.*)$', 'm'));
  return match ? match[1].replace(/['"]/g, '').trim() : null;
};

const supabaseUrl = extractEnv('NEXT_PUBLIC_SUPABASE_URL');
let supabaseKey = extractEnv('SUPABASE_SERVICE_ROLE_KEY');
if (!supabaseKey) supabaseKey = extractEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  console.log('--- Checking GL Entries ---');
  const { data: glEntries, error: glErr } = await supabase.from('gl_entries').select('*');
  if (glErr) {
    console.error('GL Error:', glErr);
  } else {
    console.log('Total GL Entries found:', glEntries?.length || 0);
    if (glEntries && glEntries.length > 0) console.log('Sample GL:', JSON.stringify(glEntries.slice(0, 2), null, 2));
  }

  console.log('\n--- Checking Posted Invoices ---');
  const { data: invoices, error: invErr } = await supabase.from('invoices').select('id, status, subtotal, grand_total').eq('status', 'posted');
  if (invErr) {
    console.error('Inv Error:', invErr);
  } else {
    console.log('Posted Invoices:', JSON.stringify(invoices, null, 2));
  }

  console.log('\n--- Checking Default COA Mappings ---');
  const { data: mappings, error: mapErr } = await supabase.from('default_coa_mappings').select('*');
  if (mapErr) {
    console.error('Map Error:', mapErr);
  } else {
    console.log('Mappings:', JSON.stringify(mappings, null, 2));
  }
  
  console.log('\n--- Checking Chart of Accounts (2-1-001) ---');
  const { data: coa, error: coaErr } = await supabase.from('chart_of_accounts').select('id, code, name').eq('code', '2-1-001');
  if (coaErr) {
    console.error('COA Error:', coaErr);
  } else {
    console.log('COA 2-1-001:', JSON.stringify(coa, null, 2));
  }
}

debug();
