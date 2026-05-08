'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts'
import { Loader2, TrendingUp, Package, FileText, AlertTriangle } from 'lucide-react'
import { formatRp, tierColors, tierLabels } from '@/lib/format'
import { format, subDays } from 'date-fns'

export default function ReportsPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [loading, setLoading] = useState(true)
  
  // Data states
  const [inventoryValue, setInventoryValue] = useState(0)
  const [totalPurchases, setTotalPurchases] = useState(0)
  const [varianceValue, setVarianceValue] = useState(0)
  
  const [inventoryByTier, setInventoryByTier] = useState<any[]>([])
  const [topItems, setTopItems] = useState<any[]>([])
  const [recentLedger, setRecentLedger] = useState<any[]>([])

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchReports() {
      setLoading(true)

      // 1. Current Inventory Value & Tier breakdown
      const { data: invData } = await supabase
        .from('inventory_balance')
        .select(`
          inventory_value,
          qty_on_hand,
          item_master (name, category)
        `)
        .eq('outlet_id', selectedOutletId)

      let totalVal = 0
      const tierMap: Record<string, number> = { raw: 0, wip: 0, packaging: 0, finished: 0 }
      const itemsList: any[] = []

      invData?.forEach(row => {
        const val = row.inventory_value || 0
        totalVal += val
        
        const itemMaster = row.item_master as any
        const cat = itemMaster?.category || 'unknown'
        if (cat in tierMap) tierMap[cat] += val
        
        itemsList.push({
          name: itemMaster?.name,
          category: cat,
          value: val,
          qty: row.qty_on_hand
        })
      })

      setInventoryValue(totalVal)
      
      const pieData = Object.entries(tierMap)
        .filter(([_, val]) => val > 0)
        .map(([name, value]) => ({ name: tierLabels[name] || name, value }))
      setInventoryByTier(pieData)

      itemsList.sort((a, b) => b.value - a.value)
      setTopItems(itemsList.slice(0, 10))

      // 2. Total Purchases (Last 30 days)
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd')
      const { data: invoices } = await supabase
        .from('invoices')
        .select('grand_total')
        .eq('outlet_id', selectedOutletId)
        .eq('status', 'posted')
        .gte('invoice_date', thirtyDaysAgo)

      const purchases = invoices?.reduce((sum, inv) => sum + (inv.grand_total || 0), 0) || 0
      setTotalPurchases(purchases)

      // 3. Opname Variance (Last 30 days)
      const { data: opnames } = await supabase
        .from('opname_log')
        .select('variance_value')
        .eq('outlet_id', selectedOutletId)
        .gte('opname_date', thirtyDaysAgo)

      const variance = opnames?.reduce((sum, op) => sum + (op.variance_value || 0), 0) || 0
      setVarianceValue(variance)

      // 4. Recent Stock Ledger
      const { data: ledger } = await supabase
        .from('stock_ledger')
        .select(`
          created_at,
          txn_type,
          qty,
          total_value,
          item_master (name, unit)
        `)
        .eq('outlet_id', selectedOutletId)
        .order('created_at', { ascending: false })
        .limit(20)

      setRecentLedger(ledger || [])
      setLoading(false)
    }

    fetchReports()
  }, [selectedOutletId, supabase])

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Financial Reports</h2>
        <p className="text-zinc-400 text-sm">Analyze inventory valuation, COGS, and operational metrics.</p>
      </div>

      <Tabs defaultValue="summary" className="space-y-6">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="summary" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-zinc-100">
            Executive Summary
          </TabsTrigger>
          <TabsTrigger value="inventory" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-zinc-100">
            Inventory Value
          </TabsTrigger>
          <TabsTrigger value="ledger" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-zinc-100">
            Stock Ledger
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Total Inventory Value</CardTitle>
                <Package className="h-4 w-4 text-emerald-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-zinc-100">{formatRp(inventoryValue)}</div>
                <p className="text-xs text-zinc-500 mt-1">Current total value on hand</p>
              </CardContent>
            </Card>
            
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">30d Purchases</CardTitle>
                <FileText className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-zinc-100">{formatRp(totalPurchases)}</div>
                <p className="text-xs text-zinc-500 mt-1">Total posted invoices in last 30 days</p>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">30d Net Variance</CardTitle>
                <AlertTriangle className={`h-4 w-4 ${varianceValue < 0 ? 'text-red-400' : 'text-emerald-400'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${varianceValue < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {varianceValue > 0 ? '+' : ''}{formatRp(varianceValue)}
                </div>
                <p className="text-xs text-zinc-500 mt-1">Total adjustment value from Opname</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Top 10 Items by Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topItems} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                      <XAxis type="number" tickFormatter={(val) => `Rp ${val/1000}k`} stroke="#a1a1aa" fontSize={12} />
                      <YAxis dataKey="name" type="category" width={120} stroke="#a1a1aa" fontSize={11} />
                      <RechartsTooltip 
                        formatter={(value: any) => formatRp(value as number)}
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                        itemStyle={{ color: '#3b82f6' }}
                      />
                      <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Value by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={inventoryByTier}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {inventoryByTier.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        formatter={(value: any) => formatRp(value as number)}
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', color: '#a1a1aa' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="inventory">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Inventory Valuation Detail</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-zinc-800">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-zinc-400">Item</TableHead>
                    <TableHead className="text-zinc-400">Category</TableHead>
                    <TableHead className="text-zinc-400 text-right">Qty On Hand</TableHead>
                    <TableHead className="text-zinc-400 text-right">Avg Unit Cost</TableHead>
                    <TableHead className="text-zinc-400 text-right">Total Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItems.map((item, idx) => (
                    <TableRow key={idx} className="border-zinc-800 hover:bg-zinc-800/20">
                      <TableCell className="font-medium text-zinc-100">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={tierColors[item.category] || ''}>
                          {tierLabels[item.category] || item.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-zinc-400 font-mono">{item.qty}</TableCell>
                      <TableCell className="text-right text-zinc-400 font-mono">
                        {item.qty > 0 ? formatRp(item.value / item.qty) : 'Rp 0'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-zinc-100 font-mono">
                        {formatRp(item.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Recent Stock Movements</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-zinc-800">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-zinc-400">Time</TableHead>
                    <TableHead className="text-zinc-400">Item</TableHead>
                    <TableHead className="text-zinc-400">Type</TableHead>
                    <TableHead className="text-zinc-400 text-right">Qty</TableHead>
                    <TableHead className="text-zinc-400 text-right">Total Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLedger.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-zinc-500">No recent transactions</TableCell>
                    </TableRow>
                  ) : (
                    recentLedger.map((row, idx) => (
                      <TableRow key={idx} className="border-zinc-800 hover:bg-zinc-800/20">
                        <TableCell className="text-zinc-500 text-xs">
                          {format(new Date(row.created_at), 'dd MMM, HH:mm')}
                        </TableCell>
                        <TableCell className="font-medium text-zinc-100">{(row.item_master as any)?.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={row.txn_type.includes('IN') ? 'border-emerald-900 text-emerald-400' : 'border-amber-900 text-amber-400'}>
                            {row.txn_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-zinc-300">
                          {row.qty > 0 ? '+' : ''}{row.qty} {(row.item_master as any)?.unit}
                        </TableCell>
                        <TableCell className="text-right font-mono text-zinc-400">
                          {formatRp(row.total_value)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
