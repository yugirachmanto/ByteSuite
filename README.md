# 🛸 ByteSuite ERP

**ByteSuite** is a modern, high-performance Cloud ERP designed for F&B businesses, central kitchens, and manufacturing units. Built with **Next.js 15**, **Supabase**, and **Tailwind CSS**, it provides a seamless experience for managing the entire supply chain—from raw material purchase to production and financial reporting.

---

## 🛠 Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth with RLS (Row Level Security)
- **Styling**: Tailwind CSS + Shadcn/UI
- **Icons**: Lucide React
- **Accounting**: Double-entry automated bookkeeping system

---

## 🚀 Key Modules

### 1. 🧾 Invoice Pipeline (OCR-Powered)
Efficiently manage inbound inventory by uploading invoice images.
- **AI Extraction**: Automatically extracts vendor details, line items, quantities, and prices.
- **Review & Post**: Audit extracted data before it hits your inventory and ledgers.
- **Automated Bookkeeping**: Posting an invoice automatically debits Inventory Assets and credits Accounts Payable.

### 2. 📦 Inventory & Stock Engine
Real-time stock tracking across multiple outlets.
- **FIFO Batching**: Tracks items in distinct batches to ensure accurate cost of goods sold (COGS).
- **Stock Ledger**: Full audit trail (Stock Movement Report) for every gram or porsi used.
- **Inventory Valuation**: Automated calculation of stock value using moving average cost.

### 3. 👨‍🍳 Production & BOM (Bill of Materials)
Manage your central kitchen or production floor with precision.
- **BOM Management**: Define complex recipes (Ingredients -> WIP/Finished Goods).
- **WIP Tracking**: Record Work-in-Progress production (e.g., producing "Bumbu Dasar" from raw spices).
- **Automated Consumption**: Posting production automatically deducts ingredients from stock based on the BOM.

### 4. ⚖️ Accounting & Finance
A professional-grade accounting suite built into the core.
- **Dashboard**: High-level overview of Cash, Revenue, AR, and AP.
- **General Ledger**: Transaction history with automated running balances per account.
- **Financial Reports**: 
    - **Profit & Loss**: Monitor margins and operational expenses.
    - **Balance Sheet**: Assets vs. Liabilities + Equity.
- **Manual Journals**: Record custom adjustments with a built-in balancing validator.

### 5. 📋 Stock Opname (Physical Count)
Keep your digital records in sync with physical reality.
- **Variance Tracking**: Automatically calculates discrepancies between system and physical counts.
- **Financial Adjustments**: Opname losses/gains are automatically logged into the financial ledger.

---

## 🏗 Database Architecture

ByteSuite uses a robust multi-tenant PostgreSQL schema:
- **Organizations**: Top-level tenant.
- **Outlets**: Business locations under an organization.
- **RLS (Row Level Security)**: All data is strictly scoped. Users can only see data belonging to their assigned `org_id` and `outlet_ids`.
- **Atomic RPCs**: Critical operations (like `post_invoice` and `post_production`) are handled by server-side PL/pgSQL functions to ensure data integrity.

---

## 💻 Development

### Setup
1. Clone the repo
2. Install dependencies: `npm install`
3. Set up environment variables in `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_key
   ```
4. Run migrations: Apply SQL files in `/supabase/migrations`.
5. Start dev server: `npm run dev`

---

## 📄 License
Internal Development - ByteSuite © 2024
