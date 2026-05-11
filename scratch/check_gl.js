
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkGL() {
  const { data, error } = await supabase
    .from('gl_entries')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
  } else if (data && data.length > 0) {
    console.log('GL Columns:', Object.keys(data[0]));
    console.log('Sample Data:', data[0]);
  } else {
    console.log('No GL data found');
  }
}

checkGL();
