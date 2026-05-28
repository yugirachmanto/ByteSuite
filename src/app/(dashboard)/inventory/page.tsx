'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Package, 
  TrendingDown, 
  Layers, 
  Search, 
  Filter,
  History,
  ArrowUpRight,
  ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchInventory() {
      setLoading(true)
      // Join inventory_balance with item_master
      const { data, error } = await supabase
        .from('inventory_balance')
        .select(`
          qty_on_hand,
          inventory_value,
          updated_at,
          item_master (
            id,
            name,
            unit,
            category,
            reorder_level
          )
        `)
        .eq('outlet_id', selectedOutletId)

      if (error) {
        console.error('Inventory fetch error:', error)
      } else if (data) {
        setItems(data)
      }
      setLoading(false)
    }

    fetchInventory()
  }, [selectedOutletId, supabase])

  const totalValue = items.reduce((sum, item) => sum + (item.inventory_value || 0), 0)
  const totalItems = items.length
  const lowStockCount = items.filter(item => item.qty_on_hand <= (item.item_master?.reorder_level || 0)).length

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'raw': return <Badge variant="outline" className="bg-blue-950/20 text-blue-400 border-blue-900/50">Raw Material</Badge>
      case 'wip': return <Badge variant="outline" className="bg-purple-950/20 text-purple-400 border-purple-900/50">WIP</Badge>
      case 'packaging': return <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700">Packaging</Badge>
      case 'finished': return <Badge variant="outline" className="bg-emerald-950/20 text-emerald-400 border-emerald-900/50">Finished Goods</Badge>
      default: return <Badge variant="outline">{category}</Badge>
    }
  }

  const filteredItems = items.filter(item => {
    const matchesSearch = item.item_master?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.item_master?.category?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || item.item_master?.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Inventory Dashboard</h2>
          <p className="text-zinc-400 text-sm">Real-time stock levels and valuation across your outlet.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/inventory/ledger">
            <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <History className="mr-2 h-4 w-4" />
              Stock Ledger
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Inventory Value</CardTitle>
            <Package className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">
              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalValue)}
            </div>
            <p className="text-xs text-zinc-500">Value of all current batches</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total SKUs</CardTitle>
            <Layers className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{totalItems}</div>
            <p className="text-xs text-zinc-500">Items tracked in inventory</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Low Stock Alert</CardTitle>
            <TrendingDown className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{lowStockCount}</div>
            <p className="text-xs text-amber-500 font-medium">Items below reorder level</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input 
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm text-zinc-100 focus:border-zinc-700 focus:outline-none"
            placeholder="Search items by name or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800 text-zinc-300 h-[38px]">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <SelectValue placeholder="Category" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="raw">Raw Material</SelectItem>
            <SelectItem value="wip">WIP</SelectItem>
            <SelectItem value="packaging">Packaging</SelectItem>
            <SelectItem value="finished">Finished Goods</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Item Name</TableHead>
              <TableHead className="text-zinc-400">Category</TableHead>
              <TableHead className="text-zinc-400 text-right">Qty On Hand</TableHead>
              <TableHead className="text-zinc-400 text-right">Inventory Value</TableHead>
              <TableHead className="text-zinc-400 text-center">Last Updated</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  Loading inventory data...
                </TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  No inventory records found matching your filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item, idx) => (
                <TableRow
                  key={idx}
                  className="border-zinc-800 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/inventory/${item.item_master?.id}`)}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-100">{item.item_master?.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{item.item_master?.unit}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getCategoryBadge(item.item_master?.category)}</TableCell>
                  <TableCell className="text-right">
                    <div className={item.qty_on_hand <= (item.item_master?.reorder_level || 0) ? "text-amber-500 font-bold" : "text-zinc-100"}>
                      {Number(item.qty_on_hand).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-zinc-300 font-medium">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.inventory_value)}
                  </TableCell>
                  <TableCell className="text-center text-zinc-500 text-xs">
                    {format(new Date(item.updated_at), 'dd MMM, HH:mm')}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-zinc-700" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
