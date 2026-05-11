
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testQuery() {
  const { data, error, status } = await supabase
    .from('invoices')
    .select('*')
    .eq('status', 'posted')
    .or('payment_status.is.null,payment_status.neq.paid')
    .limit(1);

  if (error) {
    console.error('Query Error:', error.message, 'Status:', status);
    console.error('Full Error:', JSON.stringify(error, null, 2));
  } else {
    console.log('Query Success! Data found:', data.length);
  }
}

testQuery();
