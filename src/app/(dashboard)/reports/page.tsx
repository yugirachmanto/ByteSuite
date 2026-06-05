'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useDateWindow } from '@/lib/contexts/date-window-context'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts'
import {
  Loader2, Package, FileText, AlertTriangle,
  Download, BarChart3, BookOpen, ArrowUpRight, TrendingUp,
  DollarSign, Activity, Wallet, Percent, Briefcase, Building2
} from 'lucide-react'
import { formatRp, tierColors, tierLabels } from '@/lib/format'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { generateFinancialPDF, type ReportData } from '@/lib/pdf-generator'
import { cn } from '@/lib/utils'
import { COATreeTable } from '@/components/accounting/COATreeTable'

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']

export default function ReportsPage() {
  const supabase = createClient()
  const { selectedOutletId, outlets } = useOutlet()
  const { startDate, endDate } = useDateWindow()

  const [activeTab, setActiveTab] = useState<'summary' | 'purchases' | 'inventory' | 'ledger' | 'profitability'>('summary')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [orgName, setOrgName] = useState('ByteSuite ERP')
  const [userName, setUserName] = useState('—')
  const [orgId, setOrgId] = useState<string | null>(null)

  // ── Helper: Render Visual Tree Connection Lines ──
  const renderTreeGuides = (depth: number) => {
    if (depth === 0) return null
    return (
      <span className="inline-flex items-center select-none font-mono text-zinc-700/80 mr-1.5">
        {Array.from({ length: depth - 1 }).map((_, i) => (
          <span key={i} className="inline-block w-3.5 border-r border-zinc-800/80 h-3 mr-1" />
        ))}
        <span className="text-zinc-600">└─</span>
      </span>
    )
  }

  // ── Helper: Depth-based fade config for Buku Besar ──
  // Row opacity is NOT used — we fade only text/number colors per depth
  // so tree guides and borders stay sharp. Backgrounds fade via getSubRowBg.
  const getDepthFade = (depth: number) => {
    const configs = [
      // depth 0 — main COA: bright, bold, large
      { nameCls: 'font-bold text-zinc-100 text-xs',         codeCls: 'font-bold text-xs',   numCls: 'text-zinc-200', py: 'py-3.5' },
      // depth 1 — first sub
      { nameCls: 'font-medium text-zinc-350 text-xs',       codeCls: 'font-normal text-[10px]', numCls: 'text-zinc-400', py: 'py-2.5' },
      // depth 2 — second sub
      { nameCls: 'font-normal text-zinc-500 text-[11px]',   codeCls: 'font-normal text-[10px]', numCls: 'text-zinc-500', py: 'py-2' },
      // depth 3+ — deep sub
      { nameCls: 'font-normal text-zinc-600 text-[10px]',   codeCls: 'font-normal text-[10px]', numCls: 'text-zinc-600', py: 'py-1.5' },
    ]
    return configs[Math.min(depth, configs.length - 1)]
  }

  // Sub-account gets a barely-there tinted bg that fades to nothing by depth 2
  const getSubRowBg = (depth: number) => {
    if (depth === 0) return '' // handled by getRootRowStyle
    if (depth === 1) return 'bg-zinc-800/20'
    return '' // depth 2+ : no background
  }

  // ── Helper: Distinct Root Account Row Styles ──
  const getRootRowStyle = (row: any) => {
    if (row.depth !== 0) return ''

    switch (row.type) {
      case 'income':
        return 'bg-indigo-950/40 border-l-2 border-indigo-500 hover:bg-indigo-950/50'
      case 'asset':
        return 'bg-blue-950/40 border-l-2 border-blue-500 hover:bg-blue-950/50'
      case 'expense':
        if (row.code.startsWith('5'))
          return 'bg-amber-950/40 border-l-2 border-amber-500 hover:bg-amber-950/50'
        return 'bg-purple-950/40 border-l-2 border-purple-500 hover:bg-purple-950/50'
      case 'liability':
        return 'bg-red-950/40 border-l-2 border-red-500 hover:bg-red-950/50'
      case 'equity':
        return 'bg-zinc-800/50 border-l-2 border-zinc-400 hover:bg-zinc-800/60'
      default:
        return 'bg-zinc-800/50 border-l-2 border-zinc-400 hover:bg-zinc-800/60'
    }
  }

  // Data
  const [inventoryValue, setInventoryValue] = useState(0)
  const [totalPurchases, setTotalPurchases] = useState(0)
  const [totalTax, setTotalTax] = useState(0)
  const [posTaxTotal, setPosTaxTotal] = useState(0)
  const [varianceValue, setVarianceValue] = useState(0)
  const [apOutstanding, setApOutstanding] = useState(0)
  const [inventoryByTier, setInventoryByTier] = useState<any[]>([])
  const [topItems, setTopItems] = useState<any[]>([])
  const [allItems, setAllItems] = useState<any[]>([])
  const [recentLedger, setRecentLedger] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [glSummary, setGlSummary] = useState<any[]>([])

  // Advanced Financial Metrics
  const [financialTrend, setFinancialTrend] = useState<any[]>([])

  const selectedOutlet = outlets.find(o => o.id === selectedOutletId)
  const periodLabel = `${format(startDate, 'd MMM yyyy', { locale: localeId })} — ${format(endDate, 'd MMM yyyy', { locale: localeId })}`

  // Fetch org & user info
  useEffect(() => {
    async function fetchMeta() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('org_id, full_name').eq('id', user.id).single()
      if (profile?.full_name) setUserName(profile.full_name)
      if (!profile?.org_id) return
      setOrgId(profile.org_id)
      const { data: org } = await supabase.from('organizations').select('name').eq('id', profile.org_id).single()
      if (org?.name) setOrgName(org.name)
    }
    fetchMeta()
  }, [supabase])

  useEffect(() => {
    if (!selectedOutletId) return
    async function fetchReports() {
      setLoading(true)
      const startIso = startDate.toISOString()
      const endIso = endDate.toISOString()

      const [
        { data: invData },
        { data: invoiceData },
        { data: opnames },
        { data: ledger },
        { data: apData },
        { data: glData },
        { data: allCoas },
        { data: posData },
      ] = await Promise.all([
        supabase.from('inventory_balance').select('inventory_value, qty_on_hand, item_master(name, category)').eq('outlet_id', selectedOutletId),
        supabase.from('invoices').select('vendor, invoice_no, invoice_date, grand_total, tax_total, payment_status').eq('outlet_id', selectedOutletId).eq('status', 'posted').gte('invoice_date', startIso).lte('invoice_date', endIso).order('invoice_date', { ascending: false }),
        supabase.from('opname_log').select('variance_value').eq('outlet_id', selectedOutletId).gte('opname_date', startIso).lte('opname_date', endIso),
        supabase.from('stock_ledger').select('created_at, txn_type, qty, total_value, unit_cost, item_master(name, unit)').eq('outlet_id', selectedOutletId).gte('created_at', startIso).lte('created_at', endIso).order('created_at', { ascending: false }).limit(200),
        supabase.from('invoices').select('grand_total, paid_amount').eq('outlet_id', selectedOutletId).eq('status', 'posted').neq('payment_status', 'paid'),
        supabase.from('gl_entries').select('coa_id, debit, credit, entry_date, description, chart_of_accounts(code, name, type)').eq('outlet_id', selectedOutletId).gte('entry_date', startIso).lte('entry_date', endIso),
        orgId ? supabase.from('chart_of_accounts').select('id, code, name, type, level, is_header, parent_id').eq('org_id', orgId) : Promise.resolve({ data: [] }),
        supabase.from('pos_orders').select('tax_amount, total_amount').eq('outlet_id', selectedOutletId).eq('status', 'completed').gte('created_at', startIso).lte('created_at', endIso),
      ])

      // Inventory
      let totalVal = 0
      const tierMap: Record<string, number> = { raw: 0, wip: 0, packaging: 0, finished: 0 }
      const items: any[] = []
      invData?.forEach(row => {
        const val = row.inventory_value || 0
        totalVal += val
        const im = row.item_master as any
        const cat = im?.category || 'unknown'
        if (cat in tierMap) tierMap[cat] += val
        items.push({ name: im?.name, category: cat, value: val, qty: row.qty_on_hand })
      })
      items.sort((a, b) => b.value - a.value)
      setInventoryValue(totalVal)
      setAllItems(items)
      setTopItems(items.slice(0, 10))
      setInventoryByTier(Object.entries(tierMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name: tierLabels[name] || name, value })))

      // Invoices (Purchases & Input Tax)
      const invList = invoiceData || []
      setInvoices(invList)
      setTotalPurchases(invList.reduce((s: number, i: any) => s + (i.grand_total || 0), 0))
      setTotalTax(invList.reduce((s: number, i: any) => s + (i.tax_total || 0), 0))

      // POS Orders (Sales & Output Tax)
      const posTotalTaxVal = posData?.reduce((s: number, i: any) => s + (i.tax_amount || 0), 0) || 0
      setPosTaxTotal(posTotalTaxVal)

      // Opname
      setVarianceValue(opnames?.reduce((s, o) => s + (o.variance_value || 0), 0) || 0)

      // AP
      setApOutstanding(apData?.reduce((s: number, i: any) => s + (i.grand_total - (i.paid_amount || 0)), 0) || 0)

      // Ledger
      setRecentLedger(ledger || [])

      // ── GL Summary — seeded from ALL COAs (including headers from DB) ──
      const glMap: Record<string, any> = {}
      allCoas?.forEach((c: any) => {
        glMap[c.id] = {
          id:          c.id,
          code:        c.code,
          name:        c.name,
          type:        c.type,
          level:       c.level ?? 1,
          is_header:   c.is_header ?? false,
          parent_id:   c.parent_id ?? null,
          directDebit:  0,
          directCredit: 0,
          totalDebit:   0,
          totalCredit:  0,
          children: []
        }
      })

      glData?.forEach(row => {
        const id = row.coa_id
        if (glMap[id]) {
          glMap[id].directDebit  += row.debit  || 0
          glMap[id].directCredit += row.credit || 0
        }
        // If a GL entry targets a COA not in allCoas (edge-case), skip it
        // (the trigger will prevent header posting going forward)
      })

      // ── Build Tree using real parent_id from DB ──
      const coaList = Object.values(glMap)
      const lookup: Record<string, any> = {}
      coaList.forEach((c: any) => { lookup[c.id] = c })

      const roots: any[] = []
      coaList.forEach((c: any) => {
        if (c.parent_id && lookup[c.parent_id]) {
          lookup[c.parent_id].children.push(c)
        } else {
          roots.push(c)
        }
      })

      // Dynamic self-healing: if an account has children, it is a header!
      coaList.forEach((c: any) => {
        if (c.children && c.children.length > 0) {
          c.is_header = true
        }
      })

      // —— Roll Up Balances Recursively (leaves → headers) ——
      function rollUp(node: any) {
        const hasChildren = node.children && node.children.length > 0
        if (!hasChildren) {
          // Leaf: total = direct GL entries
          node.totalDebit  = node.directDebit
          node.totalCredit = node.directCredit
          return
        }
        // Header: sum children first, then accumulate direct entries if any (safe legacy fallback)
        let sumDebit  = node.directDebit || 0
        let sumCredit = node.directCredit || 0
        node.children.forEach((child: any) => {
          rollUp(child)
          sumDebit  += child.totalDebit
          sumCredit += child.totalCredit
        })
        node.totalDebit  = sumDebit
        node.totalCredit = sumCredit
      }

      roots.forEach(root => rollUp(root))

      // ── Aggregate Trend Data from GL Entries ──
      const trendMap: Record<string, { rawDate: string, date: string, income: number, expense: number }> = {}
      glData?.forEach(row => {
        const d = row.entry_date.split('T')[0]
        if (!trendMap[d]) trendMap[d] = { rawDate: d, date: format(new Date(d), 'dd MMM'), income: 0, expense: 0 }
        
        const coa = row.chart_of_accounts as any
        if (!coa) return
        
        if (coa.type === 'income') {
          trendMap[d].income += (row.credit || 0) - (row.debit || 0)
        } else if (coa.type === 'expense') {
          trendMap[d].expense += (row.debit || 0) - (row.credit || 0)
        }
      })
      const trendArr = Object.values(trendMap).sort((a, b) => a.rawDate.localeCompare(b.rawDate))
      setFinancialTrend(trendArr)

      // ── Flatten Tree for Render (depth = level - 1 for CSS classes) ──
      function flatten(nodes: any[], result: any[] = []) {
        nodes
          .slice()
          .sort((a: any, b: any) => a.code.localeCompare(b.code))
          .forEach(node => {
            node.depth = (node.level ?? 1) - 1
            result.push(node)
            if (node.children?.length > 0) {
              flatten(node.children, result)
            }
          })
        return result
      }

      roots.sort((a: any, b: any) => a.code.localeCompare(b.code))
      const flatSummary = flatten(roots)
      setGlSummary(flatSummary)

      setLoading(false)
    }
    fetchReports()
  }, [selectedOutletId, orgId, supabase, startDate, endDate])

  // ── PDF Export ────────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const reportData: ReportData = {
        orgName,
        outletName: selectedOutlet?.name || 'Outlet',
        startDate,
        endDate,
        generatedBy: userName,
        totalPurchases,
        inventoryValue,
        totalTax,
        posTaxTotal,
        apOutstanding,
        varianceValue,
        invoices,
        inventoryItems: allItems,
        glSummary,
      }
      await generateFinancialPDF(reportData)
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  // Root accounts (parent_id is null) represent the top-level anchors of all COA classes
  const totalDebits = glSummary.filter(r => r.parent_id === null).reduce((s, r) => s + r.totalDebit, 0)
  const totalCredits = glSummary.filter(r => r.parent_id === null).reduce((s, r) => s + r.totalCredit, 0)
  const isBalanced = Math.abs(totalDebits - totalCredits) < 1

  // ── Profitability & EBITDA Calculations ────────────────────────────────────
  // Use level-1 headers as top-level rollup anchors; leaves for D&A detection.
  const incomeEntries = glSummary.filter(c => c.type === 'income' || c.code.startsWith('4'))
  const cogsEntries   = glSummary.filter(c => c.code.startsWith('5'))
  const opexEntries   = glSummary.filter(c => c.code.startsWith('6'))
  
  // Balance Sheet
  const assetEntries = glSummary.filter(c => c.code.startsWith('1'))
  const liabilityEntries = glSummary.filter(c => c.code.startsWith('2'))
  const equityEntries = glSummary.filter(c => c.code.startsWith('3'))

  const totalAssets = assetEntries
    .filter(c => c.level === 1 && c.is_header)
    .reduce((sum, c) => sum + (c.totalDebit - c.totalCredit), 0)

  const totalLiabilities = liabilityEntries
    .filter(c => c.level === 1 && c.is_header)
    .reduce((sum, c) => sum + (c.totalCredit - c.totalDebit), 0)

  const totalEquity = equityEntries
    .filter(c => c.level === 1 && c.is_header)
    .reduce((sum, c) => sum + (c.totalCredit - c.totalDebit), 0)

  // Revenue = sum of level-1 income headers (already rolled up)
  const totalRevenue = incomeEntries
    .filter(c => c.level === 1 && c.is_header)
    .reduce((sum, c) => sum + Math.max(0, c.totalCredit - c.totalDebit), 0)
  // COGS = sum of level-1 COGS headers
  const totalCogs = cogsEntries
    .filter(c => c.level === 1 && c.is_header)
    .reduce((sum, c) => sum + Math.max(0, c.totalDebit - c.totalCredit), 0)
  const grossProfit       = totalRevenue - totalCogs
  const grossProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // D&A: leaf accounts under OPEX whose name contains depreciation/amortization keywords
  const daEntries = opexEntries.filter(c =>
    !c.is_header && (
      c.name.toLowerCase().includes('penyusutan') ||
      c.name.toLowerCase().includes('amortisasi') ||
      c.name.toLowerCase().includes('depresiasi') ||
      c.name.toLowerCase().includes('depreciation') ||
      c.name.toLowerCase().includes('amortization')
    )
  )
  const daCodesSet = new Set(daEntries.map((c: any) => c.code))
  const totalDa = daEntries.reduce((sum, c) => sum + Math.max(0, c.totalDebit - c.totalCredit), 0)

  // Standard OPEX = all OPEX except D&A accounts
  const standardOpexEntries = opexEntries.filter(c => !daCodesSet.has(c.code))
  // OPEX total from level-1 headers minus D&A
  const totalOpexRoots = opexEntries
    .filter(c => c.level === 1 && c.is_header)
    .reduce((sum, c) => sum + Math.max(0, c.totalDebit - c.totalCredit), 0)
  const totalOpex = totalOpexRoots - totalDa

  // EBITDA = Gross Profit - Total OPEX (excl. D&A)
  const ebitda = grossProfit - totalOpex

  // EBIT = EBITDA - D&A
  const ebit = ebitda - totalDa

  // Non-Operating / Interest & Taxes (code starts with 7 or expense not in 5/6)
  const interestTaxEntries = glSummary.filter(c =>
    c.type === 'expense' &&
    !c.code.startsWith('5') &&
    !c.code.startsWith('6')
  )
  const totalInterestTax = interestTaxEntries
    .filter(c => c.level === 1 && c.is_header)
    .reduce((sum, c) => sum + Math.max(0, c.totalDebit - c.totalCredit), 0)

  // Net Income = EBIT - Interest & Tax
  const netIncome       = ebit - totalInterestTax
  const netProfitMargin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0

  const tabs = [
    { id: 'summary',       label: 'Executive Summary',    icon: BarChart3 },
    { id: 'profitability', label: 'Profit & EBITDA',      icon: TrendingUp },
    { id: 'purchases',     label: 'Laporan Pembelian',     icon: FileText },
    { id: 'inventory',     label: 'Penilaian Inventori',   icon: Package },
    { id: 'ledger',        label: 'Buku Besar (GL)',        icon: BookOpen },
  ]

  return (
    <div className="space-y-6">
      {/* ── Page Header ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Laporan Keuangan</h2>
          <p className="text-zinc-400 text-sm mt-0.5">
            {selectedOutlet?.name || '—'} · <span className="text-zinc-300">{periodLabel}</span>
          </p>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={exporting || loading}
          className="flex items-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-sm font-semibold text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/60 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Membuat PDF...' : 'Export PDF'}
        </button>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        {[
          { label: 'Total Pembelian', value: formatRp(totalPurchases), icon: FileText,      color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20'  },
          { label: 'Nilai Inventori', value: formatRp(inventoryValue), icon: Package,       color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
          { label: 'PPN Masukan (Input)', value: formatRp(totalTax),       icon: TrendingUp,    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'   },
          { label: 'PPN Keluaran (Output)', value: formatRp(posTaxTotal),  icon: TrendingUp,    color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20'  },
          { label: 'Hutang Dagang',   value: formatRp(apOutstanding),  icon: ArrowUpRight,  color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20'     },
          { label: 'Selisih Opname',  value: (varianceValue >= 0 ? '+' : '') + formatRp(varianceValue), icon: AlertTriangle, color: varianceValue >= 0 ? 'text-emerald-400' : 'text-red-400', bg: varianceValue >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10', border: varianceValue >= 0 ? 'border-emerald-500/20' : 'border-red-500/20' },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-xl border ${kpi.border} bg-zinc-900/50 p-4 backdrop-blur-sm`}>
            <div className={`mb-3 w-fit rounded-lg p-1.5 ${kpi.bg}`}>
              <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
            </div>
            <div className={`text-lg font-bold font-mono tracking-tight ${kpi.color}`}>
              {loading ? <div className="h-5 w-20 animate-pulse rounded bg-zinc-800" /> : kpi.value}
            </div>
            <div className="text-[10px] text-zinc-500 font-medium mt-1 uppercase tracking-wider">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tab Bar ───────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1 w-fit">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-150 ${
              activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}>
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex h-64 items-center justify-center text-zinc-600">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {/* ── Executive Summary ──────────────────────────────────────── */}
      {!loading && activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Advanced Financial Performance KPIs */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-400" />
              Performa Keuangan (Laba Rugi)
            </h3>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 relative overflow-hidden">
                <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1">Pendapatan (Revenue)</div>
                <div className="text-xl font-bold font-mono text-emerald-400">{formatRp(totalRevenue)}</div>
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 relative overflow-hidden">
                <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1">HPP (COGS)</div>
                <div className="text-xl font-bold font-mono text-rose-400">{formatRp(totalCogs)}</div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 relative overflow-hidden">
                <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1 flex justify-between">
                  <span>Laba Kotor</span>
                  <span className="text-amber-500">{totalRevenue ? ((totalRevenue - totalCogs)/totalRevenue*100).toFixed(1) : 0}%</span>
                </div>
                <div className="text-xl font-bold font-mono text-amber-400">{formatRp(totalRevenue - totalCogs)}</div>
              </div>
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 relative overflow-hidden">
                <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1 flex justify-between">
                  <span>Laba Bersih</span>
                  <span className="text-indigo-500">{totalRevenue ? ((totalRevenue - totalCogs - totalOpex)/totalRevenue*100).toFixed(1) : 0}%</span>
                </div>
                <div className="text-xl font-bold font-mono text-indigo-400">{formatRp(totalRevenue - totalCogs - totalOpex)}</div>
              </div>
            </div>
          </div>

          {/* Balance Sheet Snapshot */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-cyan-400" />
              Posisi Keuangan (Neraca)
            </h3>
            <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1">Total Aset</div>
                  <div className="text-lg font-bold font-mono text-cyan-400">{formatRp(totalAssets)}</div>
                </div>
                <Wallet className="h-8 w-8 text-cyan-500/20" />
              </div>
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1">Total Kewajiban</div>
                  <div className="text-lg font-bold font-mono text-orange-400">{formatRp(totalLiabilities)}</div>
                </div>
                <Briefcase className="h-8 w-8 text-orange-500/20" />
              </div>
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1">Total Ekuitas</div>
                  <div className="text-lg font-bold font-mono text-purple-400">{formatRp(totalEquity)}</div>
                </div>
                <PieChart className="h-8 w-8 text-purple-500/20" />
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-1 lg:grid-cols-3">
            {/* Trend Chart (Takes 2 columns) */}
            <div className="lg:col-span-2 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-4">Tren Pendapatan vs Pengeluaran</p>
              <div className="h-72">
                {financialTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={financialTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="date" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={v => `${(v / 1000000).toFixed(0)}jt`} stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                      <RechartsTooltip cursor={{ fill: 'transparent' }} formatter={(v: any) => formatRp(v)} labelStyle={{ color: '#a1a1aa' }} contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5', fontSize: 12, borderRadius: '8px' }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }} />
                      <Area type="monotone" dataKey="income" name="Pendapatan" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                      <Area type="monotone" dataKey="expense" name="Pengeluaran" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">Tidak ada data tren pada periode ini</div>
                )}
              </div>
            </div>

            {/* Existing Inventory Chart moved here (Takes 1 column) */}
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-4">Nilai Inventori per Kategori</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={inventoryByTier} cx="50%" cy="45%" innerRadius={60} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                      {inventoryByTier.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip cursor={{ fill: 'transparent' }} formatter={(v: any) => formatRp(v)} contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5', fontSize: 12, borderRadius: '8px' }} />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '11px', color: '#a1a1aa', paddingTop: 20 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          
          {/* Top 10 Items Chart */}
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-4">Top 10 Item Inventori by Nilai</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topItems} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${(v / 1000000).toFixed(0)}jt`} stroke="#52525b" fontSize={10} />
                  <YAxis dataKey="name" type="category" width={110} stroke="#52525b" fontSize={10} tick={{ fill: '#a1a1aa' }} />
                  <RechartsTooltip cursor={{ fill: 'transparent' }} formatter={(v: any) => formatRp(v)} contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5', fontSize: 12 }} />
                  <Bar dataKey="value" name="Nilai Inventori" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Profit & EBITDA Analysis ────────────────────────────────── */}
      {!loading && activeTab === 'profitability' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: 'Margin Laba Kotor',
                value: `${grossProfitMargin.toFixed(1)}%`,
                desc: 'Gross Profit Margin',
                color: 'text-indigo-400',
                bg: 'bg-indigo-500/10',
                border: 'border-indigo-500/20'
              },
              {
                label: 'EBITDA',
                value: formatRp(ebitda),
                desc: 'Earnings Before Interest, Taxes, D&A',
                color: 'text-purple-400',
                bg: 'bg-purple-500/10',
                border: 'border-purple-500/20'
              },
              {
                label: 'EBIT (Laba Operasional)',
                value: formatRp(ebit),
                desc: 'Earnings Before Interest & Taxes',
                color: 'text-cyan-400',
                bg: 'bg-cyan-500/10',
                border: 'border-cyan-500/20'
              },
              {
                label: 'Margin Laba Bersih',
                value: `${netProfitMargin.toFixed(1)}%`,
                desc: `Laba Bersih: ${formatRp(netIncome)}`,
                color: netIncome >= 0 ? 'text-emerald-400' : 'text-red-400',
                bg: netIncome >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10',
                border: netIncome >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'
              }
            ].map(kpi => (
              <div key={kpi.label} className={`rounded-xl border ${kpi.border} bg-zinc-900/50 p-5 backdrop-blur-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">{kpi.label}</span>
                  <div className={`rounded-lg p-1.5 ${kpi.bg}`}>
                    <TrendingUp className={`h-3.5 w-3.5 ${kpi.color}`} />
                  </div>
                </div>
                <div className={`text-xl font-bold font-mono tracking-tight ${kpi.color}`}>
                  {kpi.value}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1 font-medium">{kpi.desc}</div>
              </div>
            ))}
          </div>

          {/* Income Statement Table */}
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800/60">
              <p className="text-sm font-bold text-zinc-100">Laporan Laba Rugi (Income Statement)</p>
              <p className="text-[11px] text-zinc-500">{periodLabel} · Berdasarkan Entri GL</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/60 bg-zinc-900/20">
                    <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">Akun / Kategori</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-500">Debit</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-500">Kredit</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-500">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {/* PENDAPATAN */}
                  <tr className="bg-zinc-800/20 font-bold border-b border-zinc-800/30">
                    <td colSpan={4} className="px-6 py-2.5 text-xs text-indigo-400 uppercase tracking-wider">1. Pendapatan (Revenue)</td>
                  </tr>
                  {incomeEntries.map((row: any) => {
                    const isRoot = row.depth === 0
                    return (
                      <tr key={row.code} className={cn(
                        "border-b border-zinc-850/50 transition-all duration-100",
                        getRootRowStyle(row)
                      )}>
                        <td className="px-6 py-2.5 text-xs">
                          <span className="flex items-center">
                            {renderTreeGuides(row.depth)}
                            <span className="font-mono text-indigo-500/70 mr-2 select-none">{row.code}</span>
                            <span className={cn(isRoot ? "font-bold text-zinc-100" : "text-zinc-300 font-medium")}>
                              {row.name}
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">{row.totalDebit > 0 ? formatRp(row.totalDebit) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-300">{row.totalCredit > 0 ? formatRp(row.totalCredit) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs font-bold text-zinc-200">{formatRp(row.totalCredit - row.totalDebit)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-indigo-950/20 font-bold border-b-2 border-zinc-800">
                    <td className="px-6 py-3 text-xs text-indigo-300">Total Pendapatan Bersih</td>
                    <td className="px-6 py-3 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-3 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-3 text-right font-mono text-sm text-indigo-400">{formatRp(totalRevenue)}</td>
                  </tr>

                  {/* HPP / COGS */}
                  <tr className="bg-zinc-800/20 font-bold border-b border-zinc-800/30">
                    <td colSpan={4} className="px-6 py-2.5 text-xs text-amber-400 uppercase tracking-wider">2. Harga Pokok Penjualan (COGS)</td>
                  </tr>
                  {cogsEntries.map((row: any) => {
                    const isRoot = row.depth === 0
                    return (
                      <tr key={row.code} className={cn(
                        "border-b border-zinc-850/50 transition-all duration-100",
                        getRootRowStyle(row)
                      )}>
                        <td className="px-6 py-2.5 text-xs">
                          <span className="flex items-center">
                            {renderTreeGuides(row.depth)}
                            <span className="font-mono text-amber-500/70 mr-2 select-none">{row.code}</span>
                            <span className={cn(isRoot ? "font-bold text-zinc-100" : "text-zinc-300 font-medium")}>
                              {row.name}
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-300">{row.totalDebit > 0 ? formatRp(row.totalDebit) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">{row.totalCredit > 0 ? formatRp(row.totalCredit) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs font-bold text-zinc-200">{formatRp(row.totalDebit - row.totalCredit)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-amber-950/20 font-bold border-b-2 border-zinc-800">
                    <td className="px-6 py-3 text-xs text-amber-300">Total Harga Pokok Penjualan (COGS)</td>
                    <td className="px-6 py-3 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-3 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-3 text-right font-mono text-sm text-amber-400">{formatRp(totalCogs)}</td>
                  </tr>

                  {/* LABA KOTOR */}
                  <tr className="bg-zinc-900/60 font-black border-b-2 border-zinc-700 text-zinc-100">
                    <td className="px-6 py-3.5 text-sm uppercase tracking-wide">LABA KOTOR (Gross Profit)</td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-3.5 text-right font-mono text-base text-zinc-100">{formatRp(grossProfit)}</td>
                  </tr>

                  {/* BEBAN OPERASIONAL */}
                  <tr className="bg-zinc-800/20 font-bold border-b border-zinc-800/30">
                    <td colSpan={4} className="px-6 py-2.5 text-xs text-purple-400 uppercase tracking-wider">3. Beban Operasional (OPEX)</td>
                  </tr>
                  {standardOpexEntries.map((row: any) => {
                    const isRoot = row.depth === 0
                    return (
                      <tr key={row.code} className={cn(
                        "border-b border-zinc-850/50 transition-all duration-100",
                        getRootRowStyle(row)
                      )}>
                        <td className="px-6 py-2.5 text-xs">
                          <span className="flex items-center">
                            {renderTreeGuides(row.depth)}
                            <span className="font-mono text-purple-500/70 mr-2 select-none">{row.code}</span>
                            <span className={cn(isRoot ? "font-bold text-zinc-100" : "text-zinc-300 font-medium")}>
                              {row.name}
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-300">{row.totalDebit > 0 ? formatRp(row.totalDebit) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">{row.totalCredit > 0 ? formatRp(row.totalCredit) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs font-bold text-zinc-200">{formatRp(row.totalDebit - row.totalCredit)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-purple-950/20 font-bold border-b-2 border-zinc-850">
                    <td className="px-6 py-2.5 text-xs text-purple-300">Total Beban Operasional (OPEX)</td>
                    <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-2.5 text-right font-mono text-xs text-purple-400">{formatRp(totalOpex)}</td>
                  </tr>

                  {/* EBITDA */}
                  <tr className="bg-purple-950/40 font-bold border-b-2 border-zinc-700 text-purple-200">
                    <td className="px-6 py-3.5 text-xs uppercase tracking-wide">EBITDA</td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-3.5 text-right font-mono text-sm text-purple-300">{formatRp(ebitda)}</td>
                  </tr>

                  {/* DEPRESIASI & AMORTISASI */}
                  <tr className="bg-zinc-800/20 font-bold border-b border-zinc-800/30">
                    <td colSpan={4} className="px-6 py-2.5 text-xs text-cyan-400 uppercase tracking-wider">4. Penyusutan & Amortisasi (D&A)</td>
                  </tr>
                  {daEntries.length === 0 ? (
                    <tr className="border-b border-zinc-850">
                      <td className="px-8 py-2 text-zinc-500 italic text-xs">Tidak ada alokasi penyusutan (D&A) dalam periode ini.</td>
                      <td className="px-6 py-2 text-right font-mono text-xs text-zinc-500">—</td>
                      <td className="px-6 py-2 text-right font-mono text-xs text-zinc-500">—</td>
                      <td className="px-6 py-2 text-right font-mono text-xs font-bold text-zinc-500">Rp 0</td>
                    </tr>
                  ) : daEntries.map((row: any) => {
                    const isRoot = row.depth === 0
                    return (
                      <tr key={row.code} className={cn(
                        "border-b border-zinc-850/50 transition-all duration-100",
                        getRootRowStyle(row)
                      )}>
                        <td className="px-6 py-2.5 text-xs">
                          <span className="flex items-center">
                            {renderTreeGuides(row.depth)}
                            <span className="font-mono text-cyan-500/70 mr-2 select-none">{row.code}</span>
                            <span className={cn(isRoot ? "font-bold text-zinc-100" : "text-zinc-300 font-medium")}>
                              {row.name}
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-300">{row.totalDebit > 0 ? formatRp(row.totalDebit) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">{row.totalCredit > 0 ? formatRp(row.totalCredit) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs font-bold text-zinc-200">{formatRp(row.totalDebit - row.totalCredit)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-cyan-950/20 font-bold border-b-2 border-zinc-850">
                    <td className="px-6 py-2.5 text-xs text-cyan-300">Total Penyusutan & Amortisasi</td>
                    <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-2.5 text-right font-mono text-xs text-cyan-400">{formatRp(totalDa)}</td>
                  </tr>

                  {/* EBIT */}
                  <tr className="bg-cyan-950/40 font-bold border-b-2 border-zinc-700 text-cyan-200">
                    <td className="px-6 py-3.5 text-xs uppercase tracking-wide font-bold">EBIT (Laba Operasional)</td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-3.5 text-right font-mono text-sm text-cyan-300">{formatRp(ebit)}</td>
                  </tr>

                  {/* BUNGA & PAJAK */}
                  <tr className="bg-zinc-800/20 font-bold border-b border-zinc-800/30">
                    <td colSpan={4} className="px-6 py-2.5 text-xs text-red-400 uppercase tracking-wider">5. Beban Bunga & Pajak (Interest & Taxes)</td>
                  </tr>
                  {interestTaxEntries.length === 0 ? (
                    <tr className="border-b border-zinc-850">
                      <td className="px-8 py-2 text-zinc-500 italic text-xs">Tidak ada alokasi bunga & pajak dalam periode ini.</td>
                      <td className="px-6 py-2 text-right font-mono text-xs text-zinc-500">—</td>
                      <td className="px-6 py-2 text-right font-mono text-xs text-zinc-500">—</td>
                      <td className="px-6 py-2 text-right font-mono text-xs font-bold text-zinc-500">Rp 0</td>
                    </tr>
                  ) : interestTaxEntries.map((row: any) => {
                    const isRoot = row.depth === 0
                    return (
                      <tr key={row.code} className={cn(
                        "border-b border-zinc-850/50 transition-all duration-100",
                        getRootRowStyle(row)
                      )}>
                        <td className="px-6 py-2.5 text-xs">
                          <span className="flex items-center">
                            {renderTreeGuides(row.depth)}
                            <span className="font-mono text-red-500/70 mr-2 select-none">{row.code}</span>
                            <span className={cn(isRoot ? "font-bold text-zinc-100" : "text-zinc-300 font-medium")}>
                              {row.name}
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-300">{row.totalDebit > 0 ? formatRp(row.totalDebit) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">{row.totalCredit > 0 ? formatRp(row.totalCredit) : '—'}</td>
                        <td className="px-6 py-2.5 text-right font-mono text-xs font-bold text-zinc-200">{formatRp(row.totalDebit - row.totalCredit)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-red-950/20 font-bold border-b-2 border-zinc-850">
                    <td className="px-6 py-2.5 text-xs text-red-300">Total Bunga & Pajak</td>
                    <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-2.5 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-2.5 text-right font-mono text-xs text-red-400">{formatRp(totalInterestTax)}</td>
                  </tr>

                  {/* LABA BERSIH */}
                  <tr className={`font-black border-t-4 border-zinc-600 bg-zinc-900 ${netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <td className="px-6 py-4 text-sm uppercase tracking-wide">LABA BERSIH (Net Income)</td>
                    <td className="px-6 py-4 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-4 text-right font-mono text-xs text-zinc-500">—</td>
                    <td className="px-6 py-4 text-right font-mono text-lg font-bold">{formatRp(netIncome)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Purchases ─────────────────────────────────────────────── */}
      {!loading && activeTab === 'purchases' && (
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
            <div>
              <p className="text-sm font-bold text-zinc-100">Laporan Pembelian</p>
              <p className="text-[11px] text-zinc-500">{invoices.length} invoice · {periodLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">Total</p>
              <p className="text-sm font-bold text-indigo-400 font-mono">{formatRp(totalPurchases)}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/60">
                  {['No.', 'Vendor', 'No. Invoice', 'Tanggal', 'DPP', 'PPN', 'Total', 'Status'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-zinc-600 text-sm">Tidak ada invoice pada periode ini.</td></tr>
                ) : invoices.map((inv: any, i: number) => (
                  <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3 text-zinc-500 text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-zinc-100">{inv.vendor || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{inv.invoice_no || 'DRAFT'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">{inv.invoice_date ? format(new Date(inv.invoice_date), 'dd MMM yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatRp((inv.grand_total || 0) - (inv.tax_total || 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-400">{formatRp(inv.tax_total || 0)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatRp(inv.grand_total || 0)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${inv.payment_status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {(inv.payment_status || 'UNPAID').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {invoices.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-zinc-700 bg-zinc-900/80">
                    <td colSpan={4} className="px-4 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Total</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatRp(totalPurchases - totalTax)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">{formatRp(totalTax)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-indigo-400 text-base">{formatRp(totalPurchases)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── Inventory ─────────────────────────────────────────────── */}
      {!loading && activeTab === 'inventory' && (
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
            <div>
              <p className="text-sm font-bold text-zinc-100">Penilaian Inventori</p>
              <p className="text-[11px] text-zinc-500">{allItems.length} item · snapshot real-time</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">Total Nilai</p>
              <p className="text-sm font-bold text-emerald-400 font-mono">{formatRp(inventoryValue)}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/60">
                  {['No.', 'Nama Item', 'Kategori', 'Qty', 'Harga Rata-rata', 'Total Nilai'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allItems.map((item: any, i: number) => (
                  <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3 text-zinc-500 text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-zinc-100">{item.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${tierColors[item.category] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                        {tierLabels[item.category] || item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">{item.qty}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-400">{item.qty > 0 ? formatRp(item.value / item.qty) : 'Rp 0'}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatRp(item.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-700 bg-zinc-900/80">
                  <td colSpan={5} className="px-4 py-3 text-xs font-bold text-zinc-400 uppercase tracking-widest">Total Nilai Inventori</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 text-base">{formatRp(inventoryValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── GL Ledger ─────────────────────────────────────────────── */}
      {!loading && activeTab === 'ledger' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
              <div>
                <p className="text-sm font-bold text-zinc-100">Ringkasan Buku Besar per Akun</p>
                <p className="text-[11px] text-zinc-500">
                  {glSummary.filter(r => !r.is_header).length} akun aktif &middot; {glSummary.filter(r => r.is_header).length} header &middot; {periodLabel}
                </p>
              </div>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-lg ${isBalanced ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {isBalanced ? '\u2713 Balanced' : '\u26a0 Tidak Balance'}
              </span>
            </div>
            <COATreeTable data={glSummary} showBalances={true} />
            {/* Balance footer */}
            <div className="border-t-2 border-zinc-700 bg-zinc-900/80 px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Total (Class Headers)</span>
              <div className="flex gap-8 items-center">
                <div className="text-right">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-0.5">Debit</p>
                  <p className="font-mono font-bold text-zinc-100 text-sm">{formatRp(totalDebits)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-0.5">Kredit</p>
                  <p className="font-mono font-bold text-zinc-100 text-sm">{formatRp(totalCredits)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-0.5">Selisih</p>
                  <p className={`font-mono font-bold text-base ${isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatRp(totalDebits - totalCredits)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stock movement detail */}
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800/60">
              <p className="text-sm font-bold text-zinc-100">Detail Pergerakan Stok</p>
              <p className="text-[11px] text-zinc-500">{recentLedger.length} entri · {periodLabel}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/60">
                    {['Tanggal', 'Item', 'Tipe', 'Qty', 'Harga Satuan', 'Total Nilai'].map((h, i) => (
                      <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentLedger.length === 0 ? (
                    <tr><td colSpan={6} className="py-12 text-center text-zinc-600 text-sm">Tidak ada pergerakan stok.</td></tr>
                  ) : recentLedger.map((row: any, i: number) => (
                    <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{format(new Date(row.created_at), 'dd MMM, HH:mm')}</td>
                      <td className="px-4 py-3 font-medium text-zinc-100">{(row.item_master as any)?.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${row.txn_type.includes('IN') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {row.txn_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{row.qty > 0 ? '+' : ''}{row.qty} {(row.item_master as any)?.unit}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-400">{formatRp(row.unit_cost)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatRp(row.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
