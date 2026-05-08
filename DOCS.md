# 📘 Engineering Documentation

This document provides technical details on the inner workings of the ByteSuite ERP system.

## 🧮 Accounting Engine Logic

### Double-Entry Implementation
ByteSuite uses the `gl_entries` table as its General Ledger. Every financial transaction must satisfy the accounting equation: `Debit = Credit`.

#### 1. Purchase Invoice Posting
Triggered via `post_invoice` RPC.
- **Transaction Type**: `invoice`
- **Logic**:
    - For each line item:
        - **DEBIT**: `item_master.default_coa_id` (Asset/Inventory)
    - Total Invoice:
        - **CREDIT**: `2-1-001` (Accounts Payable / Hutang Usaha)

#### 2. Manual Journal Entry
Handled via `/accounting/journal/new`.
- **Validation**: Frontend and backend enforce `sum(debit) == sum(credit)`.
- **Reference**: `manual_journal`

#### 3. Reporting Logic
- **Profit & Loss**: 
    - `Income` accounts are calculated as `Credit - Debit`.
    - `Expense` accounts are calculated as `Debit - Credit`.
- **Balance Sheet**: 
    - `Asset` accounts: `Debit - Credit`.
    - `Liability/Equity` accounts: `Credit - Debit`.
    - *Retained Earnings* is dynamically injected from the P&L Net Profit calculation.

## 📦 Inventory Engine (FIFO)

### Stock Batches
The `stock_batches` table tracks inbound inventory. 
- When an invoice is posted, a new batch is created for each item.
- When production happens (consumption), the system should (roadmap) deduct from the oldest batch first (FIFO).

### Stock Ledger
The `stock_ledger` is the source of truth for all quantity movements. 
- **IN**: Purchase Invoices.
- **OUT**: Sales or Consumption.
- **OPNAME_ADJ**: Physical count adjustments.

## 🔐 Security & RLS

### Global Scope
Every core table has Row Level Security enabled. The standard policy for most tables is:
```sql
USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
```

### Profile & Org Isolation
Users are linked to an `organizations` record via `user_profiles`. An organization can have multiple `outlets`. Users are further restricted to specific outlets via the `outlet_ids` array in their profile.

## 🔌 RPC Reference

### `post_invoice(p_invoice_id, p_outlet_id, p_org_id, p_lines)`
- Marks invoice as `posted`.
- Creates `invoice_lines`.
- Creates `stock_batches`.
- Creates `stock_ledger` entries.
- Updates `inventory_balance`.
- Creates `gl_entries` (Accounting).

### `register_new_org(p_user_id, p_org_name, p_outlet_name, p_full_name)`
- Creates `organizations` record.
- Creates first `outlets` record.
- Creates `user_profiles`.
- Seeds a default **Chart of Accounts (COA)**.
- Seeds starter **Inventory Items**.

---
*ByteSuite Engineering Team*
