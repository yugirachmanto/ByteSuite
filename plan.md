# Antigravity Build Prompt — F&B ERP System
## Google AI Studio / Vibe Coding

---

## OVERVIEW

Build a full-stack, multi-outlet F&B (Restaurant/Café) ERP web application. The system manages the complete financial and inventory lifecycle: from invoice photo capture and AI-powered data extraction, through inventory management with a custom FIFO-AVG costing method, WIP (Work In Progress) production tracking, weekly physical stock counts, and in-app financial reporting with an optional Google Sheets export.

---

## TECH STACK

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend/Database**: Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)
- **AI Extraction**: Anthropic Claude API (`claude-sonnet-4-20250514`) with vision capability
- **Charts**: Recharts
- **Google Sheets Export**: Google Sheets API v4 (optional, user-configured)
- **Deployment**: Vercel

---

## APPLICATION STRUCTURE

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── (dashboard)/
│   ├── layout.tsx                  ← sidebar + outlet switcher
│   ├── invoices/
│   │   ├── page.tsx                ← invoice queue list
│   │   ├── upload/page.tsx         ← upload new invoice
│   │   └── [id]/review/page.tsx    ← AI extraction review & approve
│   ├── inventory/
│   │   ├── page.tsx                ← stock balance dashboard
│   │   └── ledger/page.tsx         ← full stock movement ledger
│   ├── production/
│   │   ├── page.tsx                ← WIP production log list
│   │   ├── new/page.tsx            ← log new production batch
│   │   └── bom/page.tsx            ← bill of materials editor
│   ├── opname/
│   │   ├── page.tsx                ← opname history
│   │   └── new/page.tsx            ← weekly physical count form
│   ├── reports/
│   │   └── page.tsx                ← P&L, balance sheet, charts
│   ├── settings/
│   │   ├── items/page.tsx          ← item master CRUD
│   │   ├── coa/page.tsx            ← chart of accounts CRUD
│   │   ├── users/page.tsx          ← user & role management
│   │   └── outlets/page.tsx        ← outlet configuration
│   └── integrations/
│       └── page.tsx                ← Google Sheets sync config
lib/
├── supabase/
│   ├── client.ts                   ← browser client
│   ├── server.ts                   ← server client (RSC)
│   └── types.ts                    ← generated DB types
├── ai/
│   └── extract-invoice.ts          ← Claude API extraction logic
├── inventory/
│   └── fifo-avg.ts                 ← FIFO-AVG costing engine
└── sheets/
    └── sync.ts                     ← Google Sheets push logic
```

---

## DATABASE SCHEMA (Supabase / PostgreSQL)

Create these tables with the exact columns listed. Enable Row Level Security (RLS) on all transactional tables.

```sql
-- Multi-tenancy
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT DEFAULT 'Asia/Jakarta',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  org_id UUID REFERENCES organizations(id),
  full_name TEXT,
  role TEXT CHECK (role IN ('owner','finance','cashier','kitchen','viewer')),
  outlet_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true
);

-- Reference tables
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('asset','liability','equity','income','expense')),
  parent_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE item_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  code TEXT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT CHECK (category IN ('raw','wip','packaging','finished')),
  is_inventory BOOLEAN DEFAULT true,
  default_coa_id UUID REFERENCES chart_of_accounts(id),
  reorder_level NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  output_item_id UUID REFERENCES item_master(id),
  input_item_id UUID REFERENCES item_master(id),
  qty_per_unit NUMERIC NOT NULL,
  unit TEXT NOT NULL
);

-- Invoice pipeline
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  image_url TEXT,
  status TEXT CHECK (status IN ('pending','extracted','reviewed','posted','rejected')) DEFAULT 'pending',
  vendor TEXT,
  invoice_no TEXT,
  invoice_date DATE,
  currency TEXT DEFAULT 'IDR',
  subtotal NUMERIC,
  tax_total NUMERIC,
  grand_total NUMERIC,
  extracted_data JSONB,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  item_master_id UUID REFERENCES item_master(id),
  description TEXT,
  qty NUMERIC NOT NULL,
  unit TEXT,
  unit_price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  coa_id UUID REFERENCES chart_of_accounts(id),
  is_inventory BOOLEAN DEFAULT false
);

-- Inventory engine
CREATE TABLE stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  item_id UUID REFERENCES item_master(id),
  purchase_date DATE NOT NULL,
  original_qty NUMERIC NOT NULL,
  qty_remaining NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  invoice_line_id UUID REFERENCES invoice_lines(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  item_id UUID REFERENCES item_master(id),
  txn_type TEXT CHECK (txn_type IN ('IN','OUT','PRODUCTION_IN','PRODUCTION_OUT','OPNAME_ADJ')),
  qty NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,      -- FIFO-AVG cost for OUT; purchase cost for IN
  total_value NUMERIC NOT NULL,
  reference_id UUID,
  reference_type TEXT,             -- 'invoice','production_log','opname_log'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Derived / maintained balance
CREATE TABLE inventory_balance (
  outlet_id UUID REFERENCES outlets(id),
  item_id UUID REFERENCES item_master(id),
  qty_on_hand NUMERIC DEFAULT 0,
  inventory_value NUMERIC DEFAULT 0,  -- sum of remaining batches at original cost
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (outlet_id, item_id)
);

-- WIP Production
CREATE TABLE production_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  wip_item_id UUID REFERENCES item_master(id),
  qty_produced NUMERIC NOT NULL,
  production_date DATE NOT NULL,
  unit_cost NUMERIC,               -- calculated: sum of raw material costs / qty_produced
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Physical count
CREATE TABLE opname_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  opname_date DATE NOT NULL,
  item_id UUID REFERENCES item_master(id),
  system_qty NUMERIC NOT NULL,
  physical_qty NUMERIC NOT NULL,
  variance NUMERIC GENERATED ALWAYS AS (physical_qty - system_qty) STORED,
  variance_value NUMERIC,          -- variance × current unit cost
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- General ledger
CREATE TABLE gl_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  entry_date DATE NOT NULL,
  coa_id UUID REFERENCES chart_of_accounts(id),
  debit NUMERIC DEFAULT 0,
  credit NUMERIC DEFAULT 0,
  reference_id UUID,
  reference_type TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Integration config
CREATE TABLE user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  org_id UUID REFERENCES organizations(id),
  provider TEXT DEFAULT 'google_sheets',
  access_token TEXT,
  refresh_token TEXT,
  sheet_id TEXT,
  sync_config JSONB,               -- maps table names to sheet tab names
  last_synced_at TIMESTAMPTZ
);
```

**RLS Policies** — apply to all tables with `outlet_id`:
```sql
-- Example for stock_ledger (repeat pattern for all outlet-scoped tables)
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their outlet data"
ON stock_ledger FOR ALL
USING (
  outlet_id = ANY(
    SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()
  )
);
```

---

## INVENTORY COSTING ENGINE — FIFO-AVG

This is the core business logic. Implement exactly as specified.

**Method name**: FIFO-AVG  
**Rule**: Use FIFO to determine which batches are consumed by a stock-out. Cost per unit = simple average of the unique unit prices of those batches (NOT qty-weighted). Remaining partial batches keep their original unit cost.

```typescript
// lib/inventory/fifo-avg.ts

export interface Batch {
  id: string
  item_id: string
  outlet_id: string
  purchase_date: string
  qty_remaining: number
  unit_cost: number
}

export interface StockOutResult {
  cost_per_unit: number          // simple avg of unique prices touched
  total_cogs: number
  batches_touched: {
    batch_id: string
    qty_consumed: number
    unit_cost: number
  }[]
  updated_batches: Batch[]       // batches with updated qty_remaining
}

export function calcFifoAvg(
  batches: Batch[],              // MUST be sorted oldest-first
  qty_out: number
): StockOutResult {
  const totalAvailable = batches.reduce((s, b) => s + b.qty_remaining, 0)

  if (qty_out > totalAvailable + 0.0001) {
    throw new Error(
      `Insufficient stock: need ${qty_out}, available ${totalAvailable}`
    )
  }

  let remaining = qty_out
  const touched: StockOutResult['batches_touched'] = []
  const updatedBatches = batches.map(b => ({ ...b }))

  for (const batch of updatedBatches) {
    if (remaining <= 0) break
    const consume = Math.min(batch.qty_remaining, remaining)
    touched.push({
      batch_id: batch.id,
      qty_consumed: consume,
      unit_cost: batch.unit_cost
    })
    batch.qty_remaining = Math.round((batch.qty_remaining - consume) * 10000) / 10000
    remaining = Math.round((remaining - consume) * 10000) / 10000
  }

  // Simple average of UNIQUE unit prices (not qty-weighted)
  const uniquePrices = [...new Set(touched.map(t => t.unit_cost))]
  const cost_per_unit = uniquePrices.reduce((s, p) => s + p, 0) / uniquePrices.length

  return {
    cost_per_unit: Math.round(cost_per_unit),
    total_cogs: Math.round(cost_per_unit * qty_out),
    batches_touched: touched,
    updated_batches: updatedBatches.filter(b => b.qty_remaining > 0.0001)
  }
}

export function calcInventoryValue(batches: Batch[]): number {
  return batches.reduce((s, b) => s + b.qty_remaining * b.unit_cost, 0)
}
```

**Example verification** (write a unit test for this):
- IN: 2KG @ Rp10,000 | IN: 2KG @ Rp11,000 | IN: 1KG @ Rp7,000
- OUT: 3KG
- Expected: batches touched = [10,000 and 11,000], avg = 10,500, COGS = Rp31,500
- Remaining batches: [1KG @ Rp11,000] and [1KG @ Rp7,000], inventory value = Rp18,000

---

## AI INVOICE EXTRACTION

```typescript
// lib/ai/extract-invoice.ts

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export interface ExtractedInvoice {
  vendor: string
  invoice_no: string
  invoice_date: string       // ISO date string
  currency: string
  line_items: {
    description: string
    qty: number
    unit: string
    unit_price: number
    total: number
    tax?: number
  }[]
  subtotal: number
  tax_total: number
  grand_total: number
}

export async function extractInvoice(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  outletName: string
): Promise<ExtractedInvoice> {

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: `You are an invoice data extraction specialist. Extract invoice data as valid JSON only.
No prose, no markdown, no code fences. Return only the raw JSON object.
Use this exact schema:
{
  "vendor": string,
  "invoice_no": string,
  "invoice_date": "YYYY-MM-DD",
  "currency": "IDR",
  "line_items": [{ "description": string, "qty": number, "unit": string, "unit_price": number, "total": number }],
  "subtotal": number,
  "tax_total": number,
  "grand_total": number
}
If a field is unclear, use null. All monetary values as numbers, no currency symbols.`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64
            }
          },
          {
            type: 'text',
            text: `Extract all data from this invoice for ${outletName}. Return JSON only.`
          }
        ]
      }
    ]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return JSON.parse(text.trim()) as ExtractedInvoice
}
```

**Trigger mechanism**: Create a Supabase Edge Function `process-invoice` that is called via a Supabase Database Webhook when a new row is inserted into the `invoices` table with `status = 'pending'`. The function downloads the image from Supabase Storage, calls `extractInvoice()`, saves the result to `invoices.extracted_data`, and updates status to `'extracted'`. Use Supabase Realtime on the frontend to watch for status changes so the UI updates automatically without polling.

---

## USER ROLES & PERMISSIONS

| Role | Outlets | Invoices | Inventory | Production | Opname | Reports | Settings |
|------|---------|----------|-----------|------------|--------|---------|----------|
| owner | all | full | full | full | full | full | full |
| finance | assigned | approve | read | read | read | full | read |
| cashier | own only | upload+review | read | — | — | — | — |
| kitchen | own only | — | read | full | full | — | — |
| viewer | assigned | read | read | read | read | read | — |

Implement role checking in Next.js middleware. Read role from Supabase JWT custom claims. Block unauthorised routes server-side before rendering.

---

## KEY UI SCREENS

### 1. Invoice Review Screen (`/invoices/[id]/review`)
- Left: invoice image preview (zoomable)
- Right: editable data table — one row per line item
- Each row: description (text), qty (number), unit (text), unit_price (number), total (auto-calc), item_master match (autocomplete dropdown), COA (dropdown), is_inventory (checkbox)
- Auto-match: on load, fuzzy-match each line item description against item_master names. Pre-fill item_master_id and coa_id if confidence > 80%.
- Unmatched items highlighted in amber
- Bottom: vendor, date, totals summary (editable)
- Actions: "Approve & Post" button (posts GL + stock IN) | "Reject" button | "Save draft"
- On approve: show loading state, then success with summary of GL entries created

### 2. Inventory Dashboard (`/inventory`)
- Summary cards: total inventory value, total items, low stock count
- Table: item name | unit | qty on hand | open batches count | inventory value | last movement date
- Filter by: category (raw/wip), outlet
- Click row → shows batch detail (FIFO queue for that item)
- Low stock items highlighted in red

### 3. Production Log Form (`/production/new`)
- Select WIP item (dropdown from item_master where category = 'wip')
- Enter qty produced and production date
- "Preview deduction" panel: shows raw materials that will be deducted based on BOM, with current stock levels and resulting balance — before confirming
- Confirm button → posts PRODUCTION_OUT to raw materials, PRODUCTION_IN to WIP, creates production_log row
- Block submission if any raw material would go negative

### 4. Weekly Opname Form (`/opname/new`)
- Select outlet and date
- Table of all inventory items: item name | unit | system qty (read-only, live from inventory_balance) | physical qty (number input) | variance (auto-calc, highlighted red if negative)
- Submit → posts OPNAME_ADJ entries for all items with non-zero variance
- Show summary: total items counted, total variance value

### 5. Reports Page (`/reports`)
- Date range picker + outlet selector (or "All outlets" for owner)
- Tabs: P&L | Balance Sheet | Inventory | Opname Variance
- P&L: Revenue (manual or from sales data) vs COGS (from stock OUT events) vs Operating Expenses (from GL entries)
- Balance Sheet: Current Assets including Inventory line (from inventory_balance), liabilities, equity
- Inventory: bar chart of inventory value by category + table of all items
- Opname Variance: weekly variance trend chart + table

---

## INVOICE → INVENTORY → GL POSTING FLOW

When user clicks "Approve & Post" on an invoice:

```
For each invoice_line where is_inventory = true:
  1. Create stock_batches row:
     { outlet_id, item_id, purchase_date: invoice.invoice_date,
       original_qty: line.qty, qty_remaining: line.qty,
       unit_cost: line.unit_price, invoice_line_id: line.id }

  2. Append to stock_ledger:
     { txn_type: 'IN', qty: line.qty, unit_cost: line.unit_price,
       total_value: line.total, reference_id: invoice.id,
       reference_type: 'invoice' }

  3. Upsert inventory_balance:
     qty_on_hand += line.qty
     inventory_value += line.total

For each invoice_line (all lines, inventory or not):
  4. Create gl_entries:
     DEBIT:  line.coa_id (inventory asset or expense account)
     CREDIT: Accounts Payable COA (or cash if paid immediately)
     amount: line.total

5. Update invoice status → 'posted'
```

When a production batch is posted:
```
For each BOM ingredient (raw material deduction):
  1. Run calcFifoAvg() on item's open batches sorted by purchase_date ASC
  2. Update stock_batches: reduce qty_remaining on touched batches
  3. Append stock_ledger: txn_type = 'PRODUCTION_OUT', unit_cost = fifo_avg result
  4. Update inventory_balance: reduce qty_on_hand and inventory_value

For WIP output:
  5. wip_unit_cost = sum of all raw material COGS / qty_produced
  6. Create stock_batches row for WIP item at wip_unit_cost
  7. Append stock_ledger: txn_type = 'PRODUCTION_IN'
  8. Update inventory_balance for WIP item
```

---

## GOOGLE SHEETS SYNC (OPTIONAL MODULE)

Location: `/integrations`

- "Connect Google Account" button → OAuth2 flow (Google Sheets scope only)
- Store refresh token encrypted in `user_integrations` table
- User pastes Google Sheet URL
- Map tabs: journal_ai | inventory_balance | stock_ledger | gl_entries | opname_log
- Sync options: Manual (button) | On every invoice approval | Daily at midnight (cron)
- Implementation: Supabase Edge Function `sync-to-sheets` that queries each mapped table and calls `spreadsheets.values.update` with `valueInputOption: 'RAW'` (full replace per tab)
- **Keep column headers identical to the original Google Sheets schema** so existing Looker Studio reports continue working

---

## MULTI-OUTLET BEHAVIOUR

- Sidebar has an outlet dropdown. Selected outlet stored in React context + cookie (`selected_outlet_id`)
- Owner role sees all outlets and an "All outlets" aggregated option in reports
- Staff roles (cashier, kitchen) do not see the outlet switcher — their outlet is fixed
- All data fetch calls include the active `outlet_id` as a filter
- RLS at the database level enforces this as a second layer of security

---

## SEED DATA

Pre-populate on first org setup:

**Chart of Accounts (Indonesian standard)**:
- 1-1-001 Kas (Cash) — asset
- 1-1-002 Bank — asset
- 1-1-003 Piutang Usaha (Accounts Receivable) — asset
- 1-1-004 Persediaan Bahan Baku (Raw Materials Inventory) — asset
- 1-1-005 Persediaan WIP (WIP Inventory) — asset
- 2-1-001 Hutang Usaha (Accounts Payable) — liability
- 4-1-001 Pendapatan Penjualan (Sales Revenue) — income
- 5-1-001 HPP Bahan Baku (COGS — Raw Materials) — expense
- 5-1-002 HPP WIP (COGS — WIP) — expense
- 6-1-001 Biaya Operasional (Operating Expenses) — expense

**Sample item_master** (10–15 common café items):
- Telur Ayam, unit: KG, category: raw, is_inventory: true, default_coa: 1-1-004
- Tepung Terigu, unit: KG, category: raw, is_inventory: true
- Gula Pasir, unit: KG, category: raw, is_inventory: true
- Kopi Arabika, unit: KG, category: raw, is_inventory: true
- Susu UHT, unit: Liter, category: raw, is_inventory: true
- Minyak Goreng, unit: Liter, category: raw, is_inventory: true
- Mentega, unit: KG, category: raw, is_inventory: true
- Kemasan Cup, unit: Pcs, category: packaging, is_inventory: true
- Saus Tomat (homemade), unit: Liter, category: wip, is_inventory: true

---

## IMPORTANT IMPLEMENTATION NOTES

1. **WAC vs FIFO-AVG**: This app uses FIFO-AVG (described above), NOT standard WAC. Do not implement standard average cost. The `calcFifoAvg()` function in `lib/inventory/fifo-avg.ts` must be used for all stock-out costing.

2. **Atomic transactions**: All multi-table write operations (approve invoice, post production, submit opname) must use Supabase transactions (via RPC or Edge Functions with `BEGIN/COMMIT`) to prevent partial writes.

3. **Inventory value in Balance Sheet**: The inventory asset value is always `SUM(qty_remaining × unit_cost)` across all open `stock_batches` for the outlet — NOT derived from gl_entries. This is the authoritative number.

4. **Currency**: All monetary values stored as integers (in Rupiah, no decimals). Display with `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })`.

5. **Date handling**: All dates stored in UTC. Display in `Asia/Jakarta` timezone. Use the outlet's `timezone` field for conversions.

6. **Mobile-friendly**: The invoice upload form and opname entry form must work well on mobile browsers (staff will use phones). Use responsive layouts for these two screens specifically.

7. **Realtime updates**: Use Supabase Realtime subscriptions on the invoices table so the invoice list page auto-updates when extraction completes — no manual refresh needed.

8. **Image storage**: Invoice images stored in a Supabase Storage bucket named `invoices`. Path: `{org_id}/{outlet_id}/{invoice_id}.{ext}`. Bucket is private — access via signed URLs only.

9. **Error handling**: If Claude extraction fails, set invoice status to `'extraction_failed'` and show a manual entry fallback on the review screen.

10. **Soft deletes**: Never hard-delete stock_ledger, gl_entries, or invoices rows. Use `is_deleted` boolean + `deleted_at` timestamp instead.

---

## FIRST THING TO BUILD

Start with the database schema migration, then the authentication flow (login/register with org+outlet setup), then the invoice upload and review screen. This is the most-used daily workflow and should be the first thing working end-to-end.