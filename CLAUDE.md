@AGENTS.md

# CLAUDE.md — F&B ERP Web App

This file is the authoritative guide for any AI agent (Claude, Antigravity, Copilot, etc.) working on this codebase. Read it fully before making any changes.

---

## Project overview

A multi-outlet F&B (restaurant/café) ERP system built for an Indonesian business. It handles:
- Purchase invoice capture with AI extraction (Claude API)
- 3-tier inventory management: raw materials → WIP → recipes
- WIP production tracking with recursive Bill of Materials
- Weekly physical stock count (opname)
- Financial reporting (P&L estimate, inventory value, COGS)
- Optional Google Sheets sync

**This is a financial system. Data integrity and calculation correctness are the highest priorities. Never take shortcuts in business logic, even for speed.**

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14, App Router, TypeScript (strict mode) |
| UI | shadcn/ui + Tailwind CSS |
| Database | Firebase Firestore |
| Auth | Firebase Auth with custom claims (RBAC) |
| File storage | Firebase Storage |
| AI extraction | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Charts | Recharts |
| Deployment | Firebase App Hosting |

---

## Project structure

```
app/
├── (auth)/
│   └── login/page.tsx
├── (dashboard)/
│   ├── layout.tsx                  ← sidebar, outlet switcher, role nav
│   ├── invoices/
│   │   ├── page.tsx                ← invoice list
│   │   └── [id]/review/page.tsx   ← review & approve (most critical UI)
│   ├── inventory/page.tsx
│   ├── production/page.tsx
│   ├── opname/page.tsx
│   ├── recipes/page.tsx
│   ├── reports/page.tsx
│   └── settings/
│       ├── items/page.tsx
│       ├── bom/page.tsx
│       ├── coa/page.tsx
│       ├── users/page.tsx
│       ├── outlets/page.tsx
│       └── integrations/page.tsx
└── api/
    └── extract-invoice/route.ts    ← Claude extraction endpoint

lib/
├── firebase/
│   ├── config.ts                   ← Firebase init (client)
│   ├── admin.ts                    ← Firebase Admin SDK (server)
│   └── auth.ts                     ← Auth helpers, role checks
├── inventory/
│   ├── fifo-avg.ts                 ← FIFO-AVG engine (pure functions)
│   ├── production.ts               ← WIP production logic
│   └── opname.ts                   ← Opname submission logic
└── sheets/
    └── sync.ts                     ← Google Sheets export
```

---

## Core domain concepts

### Material tiers

Every item in `item_master` has a `tier` field. This determines how it flows through the system.

| Tier | Name (ID) | Created by | Consumed by | Stocked? |
|---|---|---|---|---|
| `raw` | Bahan Baku | Invoice approval | Production, opname | Yes |
| `wip` | Barang Setengah Jadi | Production log | Production, opname | Yes |
| `recipe` | Resep | Settings (BOM only) | Never consumed | **No** |

**Recipes are never stocked.** They exist only as BOM definitions for food cost analysis. Never create stock_batches or stock_ledger entries for a recipe item.

### FIFO-AVG inventory valuation

This is a custom method. Do not replace it with standard WAC or pure FIFO. The rules are:

1. Stock is maintained in **batches** (`stock_batches` collection), ordered by date (oldest first)
2. On stock OUT: walk batches FIFO (oldest → newest) until quantity is fulfilled
3. **Cost per unit = simple average of UNIQUE unit prices of batches touched** — NOT weighted by quantity
4. A batch's `unit_cost` is **immutable** — set at creation, never updated
5. Partial batches keep their original `unit_cost`
6. WIP items use their own batch queue at their own produced cost — never re-derive from raw input prices

**The canonical implementation lives in `lib/inventory/fifo-avg.ts`. Always call that function. Never re-implement this logic inline.**

```typescript
// Correct usage
import { calcFifoAvg } from '@/lib/inventory/fifo-avg'

const result = calcFifoAvg(batchesSortedByDateAsc, qtyToConsume)
// result.cost_per_unit  ← simple avg of unique prices touched
// result.total_cost     ← cost_per_unit × qty
// result.batches_touched ← for audit trail
// result.updated_batches ← with qty_remaining decremented
```

### WIP production — recursive BOM

A WIP item's BOM can reference other WIP items. Nesting depth is unlimited. At production time:
- Look up BOM inputs for the output item
- Each input can be `raw` or `wip` — the same FIFO-AVG logic applies to both
- The produced WIP gets a new batch with `unit_cost = total_input_cost / qty_produced`
- Never recurse into sub-BOMs at consumption time — the cost is already embedded in the WIP batch

### Cost flow example
```
Buy Tomatoes @ Rp 10,000/KG         → raw batch: 2KG @ Rp 10,000
Produce Tomato Sauce (BOM: 3KG/L)   → consumes tomatoes via FIFO-AVG
                                    → wip batch: 1L @ Rp 30,000 (derived)
Produce Pasta Base (BOM: 0.5L sauce/L) → consumes sauce via FIFO-AVG
                                    → wip batch: 1L @ derived cost
Recipe: Pasta Arrabbiata            → theoretical cost only, no stock
```

---

## Firestore collections

| Collection | Description |
|---|---|
| `organizations` | Top-level tenant |
| `outlets` | Physical locations, each scoped by `org_id` |
| `users` | User profiles with `role` and `outlet_ids[]` |
| `item_master` | All items: raw, wip, recipe |
| `chart_of_accounts` | COA tree |
| `bom` | BOM rows: output_item_id → input_item_id + qty_per_unit |
| `invoices` | Purchase invoices with AI extraction status |
| `invoice_lines` | Line items per invoice |
| `stock_batches` | FIFO batch queue — one doc per purchase/production batch |
| `stock_ledger` | Append-only movement log — every IN/OUT/ADJ |
| `inventory_balance` | Current qty_on_hand per item per outlet (derived summary) |
| `production_log` | WIP production records |
| `opname_log` | Weekly physical count records |
| `gl_entries` | Double-entry accounting journal |

### Required fields on every transactional document
- `outlet_id` — always present, always filtered on
- `created_by` — Firebase Auth UID
- `created_at` — Firestore `serverTimestamp()`

---

## Authentication & authorization

### Roles
| Role | Can do |
|---|---|
| `owner` | Everything across all outlets |
| `finance` | Approve invoices, view reports (assigned outlets) |
| `cashier` | Upload/review invoices (own outlet only) |
| `kitchen` | Production log, opname (own outlet only) |
| `viewer` | Read-only (assigned outlets) |

### How to check permissions

```typescript
// lib/firebase/auth.ts exports these helpers
import { useRole, useOutletIds, canAccess } from '@/lib/firebase/auth'

// In server components — read from JWT claims
const { role, outlet_ids } = await getSessionClaims()

// In client components
const { role } = useRole()

// Route guard pattern
if (!canAccess(role, 'invoices', 'approve')) redirect('/unauthorized')
```

### Outlet isolation rule
**Every Firestore query on a transactional collection must include an outlet filter.**

```typescript
// ✅ Correct
const q = query(
  collection(db, 'invoices'),
  where('outlet_id', '==', currentOutletId),
  orderBy('created_at', 'desc')
)

// ❌ Never do this — returns data across all outlets
const q = query(collection(db, 'invoices'))
```

The only exception: Owner role with "All outlets" selected in the outlet switcher — in that case query by `org_id` instead.

---

## Business logic rules — non-negotiable

### Financial integrity
1. **Invoice immutability** — once `status = posted`, no field may be edited. Enforce in UI (hide edit controls) and in API routes (check status before writing).
2. **Batch immutability** — `stock_batches.unit_cost` is set once at creation. Never update it. Any migration or fix must create a new adjustment entry, not edit the batch.
3. **No negative stock** — before any consumption (production or opname), validate that `qty_on_hand >= qty_needed`. Throw a descriptive error naming the specific item if insufficient.
4. **Atomic writes** — production submissions and opname submissions must use Firestore `runTransaction()` or `writeBatch()`. Never write inventory changes as separate sequential calls.
5. **Integer money** — all Rp values are stored as plain integers. Always `Math.round()` after any division. Never store floats in monetary fields.

### BOM integrity
6. **No circular BOM references** — validate on BOM save. If Item A uses Item B, Item B must not (directly or transitively) use Item A.
7. **Recipe items have no stock** — if `item_master.tier === 'recipe'`, never write to `stock_batches`, `stock_ledger`, or `inventory_balance` for that item.

### Data consistency
8. **Dates as strings** — store all dates as `YYYY-MM-DD` strings, never as Firestore Timestamps for business dates (use Timestamps only for `created_at` / `updated_at` system fields). Timezone: `Asia/Jakarta` (WIB, UTC+7).
9. **Audit trail** — every write must record `created_by` and `created_at`. Never omit these.

---

## API routes

### `POST /api/extract-invoice`
Calls Claude API to extract structured data from an invoice image.

- Auth: verify Firebase ID token in `Authorization: Bearer <token>` header
- Input: `{ invoice_id, image_url, outlet_name }`
- Fetches image from Firebase Storage, converts to base64
- Calls `claude-sonnet-4-20250514` with vision + system prompt (returns JSON only)
- Updates invoice: `extracted_data = parsed JSON`, `status = "extracted"`
- On error: set `status = "pending"` (user can retry), return error details

**Never expose the Anthropic API key to the client.** It lives in Google Secret Manager / Firebase environment config and is only accessed server-side in this route.

### Claude extraction system prompt (do not modify without discussion)
```
You are an invoice data extraction assistant for an Indonesian F&B business.
Extract all invoice data and return ONLY a valid JSON object. No prose, no markdown, no backticks.
[schema and rules as defined in the build prompt]
```

---

## UI conventions

### Component library
Use **shadcn/ui** components exclusively. Do not install additional component libraries. Extend with Tailwind utility classes only.

### Status badges — use these exact color mappings
```typescript
const statusColors = {
  pending:   'bg-gray-100 text-gray-600',
  extracted: 'bg-blue-100 text-blue-700',
  review:    'bg-amber-100 text-amber-700',
  posted:    'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
}

const tierColors = {
  raw:    'bg-green-100 text-green-700',
  wip:    'bg-purple-100 text-purple-700',
  recipe: 'bg-orange-100 text-orange-700',
}
```

### Number formatting
```typescript
// Always use this for Rp display
const formatRp = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
// Output: Rp 10.500 (Indonesian convention uses dots as thousand separators)
```

### Loading states
All data-fetching pages must show shadcn `Skeleton` components while loading. Never show blank pages or layout shifts.

### Confirmation dialogs
Required before: invoice approval, invoice rejection, production log submit, opname submit, any delete action. Use shadcn `AlertDialog`.

### Toast notifications
Use shadcn `Sonner` for all feedback. Pattern:
```typescript
toast.success('Invoice approved and posted to inventory')
toast.error('Insufficient stock: Tepung Terigu needs 5KG, only 2KG available')
toast.warning('3 items have unmatched item master entries')
```

### Empty states
Every list/table page needs an empty state with a contextual CTA. Never show a blank table.

### Language
- **Business terms**: Indonesian (`Stok Opname`, `Bahan Baku`, `Barang Setengah Jadi`, `Resep`, `Jurnal`)
- **UI chrome**: English (`Save`, `Cancel`, `Filter`, `Export`, `Settings`)

---

## What NOT to do

- ❌ Do not use weighted average for the FIFO-AVG calculation
- ❌ Do not update `stock_batches.unit_cost` after creation
- ❌ Do not allow stock to go negative
- ❌ Do not write partial inventory transactions — always use batch writes
- ❌ Do not query Firestore without an `outlet_id` filter on transactional collections
- ❌ Do not store monetary values as floats
- ❌ Do not expose the Anthropic API key client-side
- ❌ Do not create stock entries for `tier = recipe` items
- ❌ Do not re-derive WIP cost from raw material prices at consumption time
- ❌ Do not install additional UI component libraries (shadcn/ui only)
- ❌ Do not allow circular BOM references
- ❌ Do not edit a posted invoice

---

## Out of scope (do not build)

- POS / sales integration
- Supplier management module
- Purchase order workflow
- Email or push notifications
- Native mobile app
- Multi-currency support
- Payroll / HR

---

## Seed data (on new org creation)

Auto-seed the following when a new organization is first created:

**Chart of Accounts:**
```
1-1-001  Kas                    asset
1-1-002  Bank                   asset
1-1-003  Piutang Usaha          asset
1-1-004  Persediaan Bahan Baku  asset
1-1-005  Persediaan WIP         asset
1-2-001  Aset Tetap             asset
2-1-001  Hutang Usaha           liability
2-1-002  Hutang Pajak           liability
3-1-001  Modal Pemilik          equity
4-1-001  Pendapatan Makanan     income
4-1-002  Pendapatan Minuman     income
5-1-001  HPP Bahan Baku         expense
5-1-002  HPP WIP Terpakai       expense
6-1-001  Beban Operasional      expense
6-1-002  Beban Utilitas         expense
6-1-003  Beban Sewa             expense
6-1-004  Beban Tenaga Kerja     expense
```

**Sample items:**
```
Raw:    Telur Ayam (KG), Tepung Terigu (KG), Gula Pasir (KG), Minyak Goreng (L), Bawang Merah (KG)
WIP:    Bumbu Dasar Merah (KG), Adonan Roti (KG)
Recipe: Nasi Goreng Spesial
```

---

## Key files — read before touching

| File | Why it matters |
|---|---|
| `lib/inventory/fifo-avg.ts` | Core valuation engine — changes affect all financial data |
| `lib/inventory/production.ts` | WIP production — must use atomic Firestore transactions |
| `app/api/extract-invoice/route.ts` | Handles Anthropic API key — never expose to client |
| `app/(dashboard)/layout.tsx` | Outlet switcher and role-based nav — all pages depend on it |
| `app/(dashboard)/invoices/[id]/review/page.tsx` | Most-used daily screen — highest UX priority |

---

*CLAUDE.md version: 1.0*
*Last updated: May 2026*
*Stack: Next.js 14 + Firebase + shadcn/ui + Claude API*
*Domain: Multi-outlet F&B ERP | Indonesia | IDR*