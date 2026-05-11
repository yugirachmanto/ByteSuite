'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Search, 
  Loader2, 
  Tag, 
  ChevronRight, 
  Filter,
  ArrowUpRight,
  Package
} from 'lucide-react'
import { formatRp } from '@/lib/format'
import { toast } from 'sonner'

export default function ProductsPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<any[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function fetchProducts() {
      if (!selectedOutletId) return
      setLoading(true)
      try {
        // Fetch items with category 'finished'
        const { data: items, error: itemsError } = await supabase
          .from('item_master')
          .select('*, product_prices!left(*)')
          .eq('category', 'finished')
          .eq('product_prices.outlet_id', selectedOutletId)
          .order('name')
        
        if (itemsError) throw itemsError

        // Flatten data (item_master with its price for THIS outlet)
        const flattened = (items || []).map(item => ({
          ...item,
          price: item.product_prices?.[0]?.selling_price || 0
        }))

        setProducts(flattened)
      } catch (error: any) {
        toast.error('Failed to load products')
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [supabase, selectedOutletId])

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.code?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading Products...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Product Management</h2>
          <p className="text-zinc-400 text-sm">Manage menu items, pricing, and recipes.</p>
        </div>
        <Link href="/products/new">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Plus className="h-4 w-4 mr-2" /> Add New Product
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{products.length}</div>
          </CardContent>
        </Card>
        {/* Placeholder for more stats */}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input 
            placeholder="Search product name or code..." 
            className="pl-10 bg-zinc-950 border-zinc-800"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" className="border-zinc-800 text-zinc-400">
          <Filter className="h-4 w-4 mr-2" /> Filter
        </Button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-zinc-900/50 border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Product</TableHead>
              <TableHead className="text-zinc-400">Category</TableHead>
              <TableHead className="text-zinc-400">Unit</TableHead>
              <TableHead className="text-zinc-400 text-right">Selling Price</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-zinc-500 italic">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((p) => (
                <TableRow key={p.id} className="border-zinc-800 hover:bg-zinc-800/30 transition-colors group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500">
                        <Tag className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-100">{p.name}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{p.code || 'No Code'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-zinc-800 text-zinc-300 border-zinc-700 capitalize">
                      {p.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm">{p.unit}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-zinc-100">
                    {p.price > 0 ? formatRp(p.price) : <span className="text-zinc-600 italic text-xs">Price not set</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/products/${p.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 group-hover:text-zinc-100 transition-colors">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
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
