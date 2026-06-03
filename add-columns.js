const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const sql = `
    ALTER TABLE tenant_invoices 
    ADD COLUMN IF NOT EXISTS receipt_url TEXT,
    ADD COLUMN IF NOT EXISTS payment_outlet_id UUID REFERENCES outlets(id),
    ADD COLUMN IF NOT EXISTS payment_asset_coa_id UUID REFERENCES chart_of_accounts(id),
    ADD COLUMN IF NOT EXISTS payment_expense_coa_id UUID REFERENCES chart_of_accounts(id);
  `;
  const { data, error } = await supabase.rpc('execute_sql', { sql });
  console.log('SQL execute_sql Result:', data, error);

  // If execute_sql RPC doesn't exist, we might not be able to alter table easily via JS client.
  // We can try to use psql or check if it's already there.
}
run();
