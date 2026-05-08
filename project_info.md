# Build Prompt — F&B ERP Web App
### For: Google AI Studio (Antigravity Agent + Firebase)
### Version: 2.0 — Final

---

## What I'm building

A full-stack web application for managing a **multi-outlet F&B business (restaurant/café)**. The system covers:
- Purchase invoice capture with AI extraction
- Inventory management across a 3-tier material hierarchy (Market List → WIP → Recipe)
- WIP production tracking with recursive Bill of Materials
- Weekly stock opname (physical count)
- Financial reporting (P&L, inventory value, COGS)
- Optional Google Sheets sync for backward compatibility

Use **Next.js 14 (App Router)** for the frontend, **Firebase (Firestore + Auth + Storage)** for the backend, and **shadcn/ui + Tailwind CSS** for UI.

---

## Tech stack

- **Framework**: Next.js 14, App Router, TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **Backend**: Firebase — Firestore (database), Firebase Auth (authentication), Firebase Storage (invoice images)
- **AI**: Anthropic Claude API (`claude-sonnet-4-20250514`) for invoice extraction — called from a Next.js API route. Store the API key in Firebase environment config / Google Secret Manager, never hardcoded.
- **Charts**: Recharts
- **Deployment**: Firebase App Hosting

---

## Business context

- Multi-outlet restaurant/café business in Indonesia
- Currency: Indonesian Rupiah (IDR / Rp) — all monetary values stored as integers
- Users upload photos/PDFs of purchase invoices → AI extracts data → user verifies → system posts to inventory and accounting
- Inventory uses a custom **FIFO-AVG** valuation method (defined precisely below)
- Stock consumption is tracked via weekly physical count (opname) and production log
- No POS system — sales data is not in scope for this build

---

## Material hierarchy — 3 tiers

This is the core conceptual model of the entire system. Every item belongs to one of three tiers:

```
TIER 1 — Market List (Bahan Baku)
  Items purchased from suppliers via invoices.
  Examples: Tomatoes, Chicken, Flour, Olive Oil, Sugar, Salt
  Stock IN: created when an invoice is approved
  Stock OUT: consumed when used in WIP production or opname adjustment

TIER 2 — WIP / Semi-finished (Barang Setengah Jadi)
  Items produced in the kitchen from Tier 1 or other Tier 2 items.
  Examples: Tomato Sauce, Spice Paste, Curry Base, Bread Dough, Marinated Chicken
  Stock IN: created when a production batch is logged
  Stock OUT: consumed when used in another WIP production or opname adjustment
  ⚠️ WIP can be made from other WIP — nesting is unlimited depth (fully recursive)

TIER 3 — Recipe / Menu Item (Resep)
  The final dish or beverage served to customers.
  Examples: Beef Rendang, Pasta Arrabbiata, Iced Latte
  Recipes are NOT stocked — they are a BOM definition only.
  Recipe cost = sum of ingredient costs (Tier 1 or Tier 2) based on current FIFO-AVG costs.
  Recipes are used for: food costing analysis, menu pricing, COGS estimation.
```

### Key rule: every item — regardless of tier — has its own independent FIFO batch queue.

When a Tier 2 WIP item is produced, its cost is calculated from what was consumed to make it (via FIFO-AVG on its inputs). That cost is "baked in" to its own batch when it enters stock. When that WIP is later consumed (in another WIP or recipe), FIFO-AVG runs on the WIP's own batch queue — it does NOT re-derive cost from raw materials. This makes multi-level costing accurate and efficient with no recursive lookups at consumption time.

### Example of 2-level WIP nesting:

```
Purchase: Tomatoes 5KG @ Rp 10,000/KG → creates raw batch in stock

Production: Tomato Sauce 2L
  BOM: 3KG tomatoes + 0.2L olive oil per 1L
  → consumes 6KG tomatoes (FIFO-AVG from tomato batches)
  → cost per unit of Tomato Sauce = FIFO-AVG of inputs ÷ qty produced
  → creates 2L Tomato Sauce batch at that unit cost

Production: Pasta Sauce Base 5L (uses Tomato Sauce as input)
  BOM: 0.5L Tomato Sauce + other ingredients per 1L
  → consumes 2.5L Tomato Sauce (FIFO-AVG from Tomato Sauce batches)
  → cost already "baked in" from prior production
  → creates Pasta Sauce Base batch at new derived cost

Recipe: Pasta Arrabbiata
  BOM: 150ml Pasta Sauce Base + 200g pasta + 10g chili flakes
  → theoretical cost computed from current batch costs of each ingredient
  → NOT stocked, only used for costing/pricing analysis
```

---

## User roles & permissions

| Role | Access |
|---|---|
| **Owner/Admin** | All outlets, all modules, user management, all reports, settings |
| **Finance** | Assigned outlets, invoices (approve), GL entries, all reports |
| **Cashier/Admin** | Own outlet only, invoice upload & review, no financial data |
| **Kitchen Staff** | Own outlet only, production log, opname entry, view stock |
| **Viewer** | Read-only across assigned outlets |

Implement role-based access using Firebase Auth custom claims. Each user JWT contains: `role`, `org_id`, `outlet_ids[]`.

---

## Firestore data model

```
organizations/
  {org_id}/
    name, created_at

outlets/
  {outlet_id}/
    org_id, name, address, timezone

users/
  {user_id}/
    org_id, role, outlet_ids[], display_name, email, is_active

item_master/
  {item_id}/
    org_id
    code              — internal SKU code
    name              — e.g. "Tomato Sauce", "Chicken Breast"
    unit              — e.g. "KG", "L", "pcs"
    tier              — "raw" | "wip" | "recipe"
    is_inventory      — true for raw and wip; false for recipe
    default_coa_id    — linked COA for GL posting
    reorder_level     — minimum qty alert threshold (raw/wip only)

chart_of_accounts/
  {coa_id}/
    org_id, code, name
    type              — "asset" | "liability" | "equity" | "income" | "expense"
    parent_id, is_active

bom/
  {bom_id}/
    org_id
    output_item_id    — the item being produced (wip or recipe)
    input_item_id     — ingredient used (raw OR wip — any tier allowed)
    qty_per_unit      — quantity of input needed per 1 unit of output
    unit              — unit of the input item
    notes

invoices/
  {invoice_id}/
    outlet_id, image_url
    status            — "pending" | "extracted" | "review" | "posted" | "rejected"
    vendor, invoice_date, invoice_no, total
    extracted_data    — raw JSON from Claude
    approved_by, approved_at, created_at, created_by

invoice_lines/
  {line_id}/
    invoice_id, outlet_id
    item_master_id    — nullable; null if unmatched
    description       — as extracted from invoice
    qty, unit, unit_price, total
    coa_id
    is_inventory      — bool, auto-set from item_master

stock_batches/
  {batch_id}/
    outlet_id
    item_id
    date              — date of creation (purchase date or production date)
    qty_remaining     — decremented on every consumption
    unit_cost         — original cost at creation; NEVER updated after creation
    source            — "purchase" | "production"
    reference_id      — invoice_id or production_log_id
    created_at

stock_ledger/
  {ledger_id}/
    outlet_id, item_id
    txn_type          — "IN" | "OUT" | "PRODUCTION_IN" | "PRODUCTION_OUT" | "OPNAME_ADJ"
    qty               — positive number (direction implied by txn_type)
    unit_cost         — cost per unit for this transaction
    total_cost        — qty × unit_cost
    batches_touched   — array of { batch_id, qty_consumed, unit_cost }
    reference_id, reference_type
    created_at, created_by

inventory_balance/
  {outlet_id}_{item_id}/
    outlet_id, item_id
    qty_on_hand       — current quantity; updated on every IN/OUT
    last_updated
    (inventory VALUE = SUM(batch.qty_remaining × batch.unit_cost) from stock_batches)

production_log/
  {prod_id}/
    outlet_id
    output_item_id    — the WIP item being produced
    qty_produced
    date
    inputs_consumed[] — array of { item_id, qty_consumed, unit_cost_avg, total_cost, batches_touched[] }
    total_input_cost  — sum of all inputs consumed
    unit_cost_produced — total_input_cost ÷ qty_produced
    notes, created_by, created_at

opname_log/
  {opname_id}/
    outlet_id, date
    item_id
    system_qty        — qty_on_hand at time of opname
    physical_qty      — entered by staff
    variance          — physical_qty − system_qty
    variance_value    — variance × current WAC (from active batches)
    notes, submitted_by, created_at

gl_entries/
  {entry_id}/
    outlet_id, date, coa_id
    debit, credit
    reference_id, reference_type
    description, created_at, created_by
```

---

## Inventory calculation — FIFO-AVG (implement exactly)

### The algorithm — `lib/inventory/fifo-avg.ts`

```typescript
export interface Batch {
  id: string
  date: string          // YYYY-MM-DD, used for FIFO ordering
  item_id: string
  qty_remaining: number
  unit_cost: number     // NEVER changes after creation
}

export interface FifoAvgResult {
  cost_per_unit: number           // simple average of unique prices touched
  total_cost: number              // cost_per_unit × qty_out
  batches_touched: {
    batch_id: string
    qty_consumed: number
    unit_cost: number
  }[]
  updated_batches: Batch[]        // with qty_remaining decremented
}

export function calcFifoAvg(
  batches: Batch[],   // must be pre-sorted by date ASC (oldest first)
  qty_out: number
): FifoAvgResult {
  const totalAvailable = batches.reduce((s, b) => s + b.qty_remaining, 0)
  if (qty_out > totalAvailable + 0.0001) {
    throw new Error(`Insufficient stock: need ${qty_out}, available ${totalAvailable}`)
  }

  let remaining = qty_out
  const touched: FifoAvgResult['batches_touched'] = []
  const updated = batches.map(b => ({ ...b })) // clone to avoid mutation

  for (const batch of updated) {
    if (remaining <= 0.0001) break
    const consume = Math.min(batch.qty_remaining, remaining)
    touched.push({ batch_id: batch.id, qty_consumed: consume, unit_cost: batch.unit_cost })
    batch.qty_remaining = Math.round((batch.qty_remaining - consume) * 10000) / 10000
    remaining = Math.round((remaining - consume) * 10000) / 10000
  }

  // CRITICAL: simple average of UNIQUE unit prices — NOT weighted by qty
  const uniquePrices = [...new Set(touched.map(t => t.unit_cost))]
  const cost_per_unit = uniquePrices.reduce((s, p) => s + p, 0) / uniquePrices.length

  return {
    cost_per_unit: Math.round(cost_per_unit),
    total_cost: Math.round(cost_per_unit * qty_out),
    batches_touched: touched,
    updated_batches: updated.filter(b => b.qty_remaining > 0.0001)
  }
}

// Current inventory value for an item
export function calcInventoryValue(batches: Batch[]): number {
  return batches.reduce((s, b) => s + b.qty_remaining * b.unit_cost, 0)
}

// Theoretical cost of producing a WIP or recipe (for costing preview only — does not consume stock)
export function calcTheoreticalCost(
  bomInputs: { item_id: string; qty_needed: number; batches: Batch[] }[]
): { item_id: string; qty_needed: number; estimated_cost: number; enough_stock: boolean }[] {
  return bomInputs.map(input => {
    const available = input.batches.reduce((s, b) => s + b.qty_remaining, 0)
    if (available < input.qty_needed) {
      return { item_id: input.item_id, qty_needed: input.qty_needed, estimated_cost: 0, enough_stock: false }
    }
    const result = calcFifoAvg(input.batches, input.qty_needed)
    return {
      item_id: input.item_id,
      qty_needed: input.qty_needed,
      estimated_cost: result.total_cost,
      enough_stock: true
    }
  })
}
```

### FIFO-AVG rules summary

| Rule | Detail |
|---|---|
| Cost method | Simple average of **unique** batch prices touched (not qty-weighted) |
| FIFO order | Always consume oldest batch first (sort by `date` ASC) |
| Partial batch | Remaining qty keeps original `unit_cost` — never recalculated |
| WIP cost | Derived at production time from inputs consumed; stored as `unit_cost_produced` |
| WIP consumption | Uses WIP's own batch queue — does NOT re-derive from raw materials |
| Recipe | Never stocked; cost is theoretical only (for menu pricing) |
| Negative stock | Block and throw error — never allow |

### FIFO-AVG example

```
Purchases (raw Telur Ayam):
  27/04 - 2 KG @ Rp 10,000  → Batch A
  28/04 - 2 KG @ Rp 11,000  → Batch B
  29/04 - 1 KG @ Rp  7,000  → Batch C

Stock OUT 3 KG on 01/05:
  FIFO: consume all 2KG from Batch A, then 1KG from Batch B
  Prices touched: 10,000 (Batch A) and 11,000 (Batch B)
  cost_per_unit = (10,000 + 11,000) / 2 = Rp 10,500   ← simple average, NOT weighted
  total_cost = 10,500 × 3 = Rp 31,500
  Remaining open batches: [1KG @ Rp 11,000] + [1KG @ Rp 7,000]
  Inventory value = 11,000 + 7,000 = Rp 18,000
```

---

## WIP production logic

When kitchen staff logs a production batch (e.g. "produce 5L Tomato Sauce"):

1. **Resolve BOM** — look up all `bom` documents where `output_item_id = wip_item_id`. Each row is an input ingredient with `qty_per_unit`.
2. **Calculate quantities needed** — for each input: `qty_needed = qty_per_unit × qty_produced`
3. **Check stock sufficiency** — for each input item, verify `qty_on_hand >= qty_needed`. If any input is insufficient, show which items are short and block submission.
4. **Show preview** — before confirming, display a table: input item | qty needed | estimated cost (via `calcTheoreticalCost`) | stock available
5. **On confirm** — run `calcFifoAvg` on each input's batch queue, consuming the needed quantity
6. **Write to Firestore atomically** (use a Firestore batch write / transaction):
   - Decrement `qty_remaining` on consumed batches in `stock_batches`
   - Add `stock_ledger` entries for each input (txn_type = `PRODUCTION_OUT`)
   - Update `inventory_balance` qty_on_hand for each input (subtract)
   - Create new `stock_batch` for the WIP output: `unit_cost = total_input_cost ÷ qty_produced`
   - Add `stock_ledger` entry for WIP output (txn_type = `PRODUCTION_IN`)
   - Update `inventory_balance` for WIP output (add)
   - Create `production_log` document

### Recursive WIP (WIP made from WIP)

The production logic above works identically whether inputs are raw or WIP — there is no special case. Because WIP items have their own `stock_batches`, FIFO-AVG runs on those batches just as it would for raw materials. Nesting depth is unlimited.

### Recipe costing (no stock movement)

Recipes (tier = "recipe") are never produced or stocked. They exist only for cost analysis. On the recipe detail page, show:
- Theoretical cost per portion (sum of `calcTheoreticalCost` for all BOM inputs)
- Suggested selling price at configurable margin (e.g. 30% food cost ratio)
- A breakdown table: ingredient | qty per portion | current estimated unit cost | line total

---

## App structure & pages

### Layout
- Sidebar navigation (collapsible on mobile)
- Outlet switcher dropdown at top of sidebar
- Owner sees all outlets + "All outlets" aggregate option
- Staff see only their assigned outlet (no switcher shown)
- Top bar: current outlet name, user avatar + role badge, notification bell

### Pages

#### `/invoices` — Invoice list
- Table: date, vendor, invoice no, total, outlet, status badge, actions
- Filter by status, date range, outlet
- "Upload Invoice" button → upload modal

#### `/invoices/upload` — Upload (modal or page)
- Drag-and-drop or tap-to-upload, mobile friendly
- Accepts JPG, PNG, PDF
- On upload: save to Firebase Storage → create invoice doc (status: pending) → call `/api/extract-invoice` → show spinner → auto-redirect to review screen when status becomes "extracted"

#### `/invoices/[id]/review` — Invoice review (most important screen)
- Split layout: image preview (left) + editable form (right)
- Header fields: vendor, invoice date, invoice number (all editable)
- Line items table (each row editable):
  - Description (from Claude, editable)
  - Item Master match (searchable dropdown, auto-matched, shows confidence badge: green/amber/red)
  - Qty, Unit, Unit Price (editable), Total (auto-calc)
  - COA picker (pre-filled from item_master default_coa_id)
  - Inventory toggle (auto-set from item_master, overridable)
  - Tier badge (raw/wip/packaging — read only, from item_master)
- Unmatched items highlighted amber with warning icon
- Totals row at bottom
- Approve → post GL + stock IN | Reject → notes dialog

#### `/inventory` — Inventory dashboard
- Summary cards: total value, items count, items below reorder level
- Tabs: Raw Materials | WIP | All
- Table: item name, tier, qty on hand, unit, current avg cost (WAC), total value, reorder status
- Click row → item detail drawer:
  - Open batches (date, qty, unit cost, value)
  - Stock ledger history (last 30 transactions)
  - BOM (if WIP): what it's made from

#### `/production` — WIP production log
- Form: select WIP item (tier=wip only), qty to produce, date, notes
- Dynamic BOM preview panel — updates as item/qty changes:
  - Table: input item | qty needed | stock available | estimated cost | status (ok/short)
  - Total estimated cost of this batch
  - Estimated unit cost of output
- Confirm button (disabled if any input is short)
- Production history table below

#### `/recipes` — Recipe management
- List of all recipes (tier=recipe)
- Create/edit recipe: name, BOM (ingredients — can be raw or WIP), serving size
- Recipe detail: cost breakdown, theoretical cost per portion, suggested price at target margin

#### `/opname` — Weekly physical count
- Select outlet and opname date
- Table: item | system qty | physical qty (input) | variance | variance value (Rp) | notes
- Shows both raw and WIP items
- Rows with variance highlighted: red for negative, green for positive
- Confirm submit dialog showing total variance value before posting
- History tab: list of past opnames, click to view detail

#### `/reports` — Financial reports
- Date range picker + outlet filter
- Sub-tabs:
  - **Summary**: purchases total, estimated COGS, inventory value, gross margin %
  - **Inventory**: item value table + bar chart (top 10 by value), tier breakdown pie chart
  - **P&L estimate**: weekly purchases vs estimated COGS line chart
  - **Opname variance**: weekly variance trend, top 5 items by cumulative variance value
  - **Recipe costing**: table of all recipes with current theoretical cost and suggested price

#### `/settings` — Settings (owner/admin only)
- **Items tab**: CRUD for item_master, tier selector, CSV import
- **BOM tab**: manage BOM per WIP or recipe item. Add/edit/delete ingredient rows. Show BOM tree (nested view for recursive WIP)
- **COA tab**: tree view of chart of accounts, add/edit accounts
- **Users tab**: invite by email, set role, assign outlets
- **Outlets tab**: add/edit outlet details
- **Integrations tab**: Google Sheets sync config (see below)

---

## Claude API integration (`/api/extract-invoice`)

```typescript
// POST /api/extract-invoice
// Body: { invoice_id: string, image_url: string, outlet_name: string }
// Auth: verify Firebase ID token from Authorization header

// Steps:
// 1. Fetch image from Firebase Storage as buffer
// 2. Convert to base64
// 3. Call Claude API (model: claude-sonnet-4-20250514, max_tokens: 1500)

const SYSTEM_PROMPT = `You are an invoice data extraction assistant for an Indonesian F&B business.
Extract all invoice data and return ONLY a valid JSON object. No prose, no markdown, no backticks.

Required JSON schema:
{
  "vendor": "string",
  "invoice_no": "string or null",
  "invoice_date": "YYYY-MM-DD",
  "currency": "IDR",
  "line_items": [
    {
      "description": "string — exact text from invoice",
      "qty": number,
      "unit": "string — e.g. KG, L, pcs, pack, botol, karung",
      "unit_price": number,
      "total": number
    }
  ],
  "subtotal": number,
  "tax_total": number,
  "grand_total": number
}

Rules:
- All amounts are in Indonesian Rupiah, stored as plain integers (no Rp symbol, no commas)
- Dates must be YYYY-MM-DD format
- Extract every line item exactly as printed on the invoice
- If a field is missing or unreadable, use null
- Do not translate or interpret item names — extract them verbatim`

// 4. Parse JSON response (strip any accidental markdown if present)
// 5. Update invoice document: extracted_data = parsed JSON, status = "extracted"
// 6. Return { success: true, invoice_id, extracted_data }

// Error handling:
// - Claude API failure → set status = "pending", return error (user can retry)
// - JSON parse failure → attempt to extract JSON from response, if still fails → error
```

Auto-trigger: when a new invoice document is created with `status: pending`, the client calls this endpoint immediately. Use a loading state with progress indicator while waiting. On completion (status becomes "extracted"), auto-navigate to the review screen.

---

## Google Sheets sync (optional integration — `/settings/integrations`)

- "Connect Google Account" button → OAuth2 with Google (Sheets + Drive scope)
- Store refresh token encrypted in Firestore `user_integrations` collection
- User pastes target Google Sheet URL
- Configure which data to sync (checkboxes): Invoices | Inventory Balance | Stock Ledger | GL Entries | Opname Log
- Sync direction: **Firestore → Sheets only** (one-way push, Firestore is always the source of truth)
- Each sync replaces the full tab content (not incremental)
- Sync triggers: Manual button | After every invoice approval | Daily scheduled (Cloud Function cron)

Column mapping for `invoices` tab (preserve these headers for Looker Studio backward compatibility):
`journal_id, date, vendor, invoice_no, item_description, qty, unit, unit_price, total, coa_code, coa_name, is_inventory, status, outlet_name`

---

## Key business logic rules

1. **Invoice immutability** — once `status = posted`, an invoice cannot be edited or re-approved
2. **No negative stock** — block any transaction that would result in `qty_on_hand < 0`; show a clear error specifying which item is short
3. **Batch immutability** — a batch's `unit_cost` is set at creation and never updated
4. **WIP cost is fixed at production time** — do not recalculate WIP batch cost when raw material prices change
5. **Atomic writes** — all production and opname transactions must use Firestore batch writes or transactions; never partial writes
6. **Outlet isolation** — every Firestore query must include `where('outlet_id', '==', currentOutletId)` unless user is Owner viewing "All outlets"
7. **Monetary precision** — all Rp values stored as integers; use `Math.round()` on all division results
8. **Dates & timezone** — all dates stored as `YYYY-MM-DD` strings; timezone is `Asia/Jakarta` (WIB, UTC+7)
9. **Audit trail** — every transactional document includes `created_by` (user_id) and `created_at` (Firestore server timestamp)
10. **BOM validation** — prevent circular BOM references (e.g. Item A → Item B → Item A); validate on save

---

## UI/UX requirements

- **Mobile-friendly** on invoice upload, opname form, and production log (staff use phones)
- **shadcn/ui components** throughout: Table, Card, Badge, Dialog, Sheet, Select, Combobox, Form, Input, Button, Tabs, Skeleton, Sonner (toasts)
- **Status badges**: pending=gray, extracted=blue, review=amber, posted=green, rejected=red
- **Tier badges**: raw=green, wip=purple, recipe=orange
- **Loading skeletons** on all data-fetching pages
- **Toast notifications** for all success/error/warning states
- **Confirmation dialogs** before: invoice approval, invoice rejection, production submission, opname submission
- **Empty states** on all list pages with a contextual CTA (e.g. "No invoices yet — upload your first invoice")
- **Business term labels**: use Indonesian for domain terms ("Stok Opname", "Bahan Baku", "Barang Setengah Jadi", "Resep"), English for UI chrome (Save, Cancel, Filter, Export)
- **Number formatting**: use `Intl.NumberFormat('id-ID')` for all Rp display (e.g. Rp 10.500 not Rp 10,500)

---

## Build order (start here, in this sequence)

```
1.  lib/firebase/config.ts              — Firebase init
2.  lib/firebase/auth.ts                — Auth helpers, role checks, outlet access guards
3.  lib/inventory/fifo-avg.ts           — FIFO-AVG engine (pure functions, no Firebase dependency)
4.  lib/inventory/production.ts         — WIP production logic (uses fifo-avg.ts)
5.  lib/inventory/opname.ts             — Opname submission logic (uses fifo-avg.ts)
6.  app/(auth)/login/page.tsx           — Login page
7.  app/(dashboard)/layout.tsx          — Sidebar + outlet switcher + role-aware nav
8.  app/(dashboard)/invoices/page.tsx   — Invoice list
9.  app/(dashboard)/invoices/[id]/review/page.tsx  — Review & approve screen
10. app/api/extract-invoice/route.ts    — Claude extraction API route
11. app/(dashboard)/inventory/page.tsx  — Inventory dashboard
12. app/(dashboard)/production/page.tsx — WIP production log
13. app/(dashboard)/opname/page.tsx     — Opname form
14. app/(dashboard)/recipes/page.tsx    — Recipe costing
15. app/(dashboard)/reports/page.tsx    — Financial reports
16. app/(dashboard)/settings/           — Settings (items, BOM, COA, users, outlets, integrations)
```

---

## Seed data (generate on first org setup)

When a new organization is created, auto-seed:

**Chart of Accounts (F&B Indonesia standard):**
```
1-1-001  Cash / Kas                    (asset)
1-1-002  Bank                          (asset)
1-1-003  Accounts Receivable           (asset)
1-1-004  Inventory — Raw Materials     (asset)
1-1-005  Inventory — WIP               (asset)
1-2-001  Fixed Assets                  (asset)
2-1-001  Accounts Payable              (liability)
2-1-002  Tax Payable                   (liability)
3-1-001  Owner Equity                  (equity)
4-1-001  Revenue — Food                (income)
4-1-002  Revenue — Beverage            (income)
5-1-001  COGS — Raw Materials          (expense)
5-1-002  COGS — WIP Consumed           (expense)
6-1-001  Operating Expense             (expense)
6-1-002  Utilities                     (expense)
6-1-003  Rent                          (expense)
6-1-004  Labor                         (expense)
```

**Sample item_master (5 raw, 2 wip, 1 recipe):**
```
Raw:    Telur Ayam (KG), Tepung Terigu (KG), Gula Pasir (KG), Minyak Goreng (L), Bawang Merah (KG)
WIP:    Bumbu Dasar Merah (KG), Adonan Roti (KG)
Recipe: Nasi Goreng Spesial
```

---

## Do not build in this phase

- POS / sales integration
- Supplier management module
- Purchase order workflow
- Email / push notifications
- Mobile native app (PWA is fine)
- Multi-currency support
- Payroll / HR module

---

*Prompt version: 2.0 — Final | Stack: Next.js 14 + Firebase + shadcn/ui + Claude API*
*Business: Multi-outlet F&B | Valuation: FIFO-AVG | WIP: recursive unlimited depth*