'use client'

import { useState, useEffect } from 'react'
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
  TableRow,
} from '@/components/ui/table'
import { Plus, Search, Loader2, ChevronRight, ChefHat } from 'lucide-react'
import Link from 'next/link'
import { formatRp } from '@/lib/format'

export default function RecipesPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [recipes, setRecipes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchRecipes() {
      setLoading(true)
      
      // 1. Get recipe items
      const { data: itemData } = await supabase
        .from('item_master')
        .select('id, name, unit')
        .eq('category', 'recipe')
        .order('name')

      if (!itemData || itemData.length === 0) {
        setRecipes([])
        setLoading(false)
        return
      }

      // 2. We need BOM to calculate costs. For simplicity in the list, 
      // we'll just show the item details. Costing is done in detail view.
      // In a real app we'd pre-calculate or do a complex view.
      
      const { data: bomData } = await supabase
        .from('bom')
        .select('output_item_id')
        .in('output_item_id', itemData.map(i => i.id))

      // Group bom count
      const bomCount: Record<string, number> = {}
      bomData?.forEach(b => {
        bomCount[b.output_item_id] = (bomCount[b.output_item_id] || 0) + 1
      })

      const enriched = itemData.map(item => ({
        ...item,
        ingredient_count: bomCount[item.id] || 0
      }))

      setRecipes(enriched)
      setLoading(false)
    }

    fetchRecipes()
  }, [selectedOutletId, supabase])

  const filtered = recipes.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Recipes & Costing</h2>
          <p className="text-zinc-400 text-sm">Manage menu items, theoretical food costs, and pricing.</p>
        </div>
        <Link href="/recipes/new">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Plus className="mr-2 h-4 w-4" />
            New Recipe
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input 
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm text-zinc-100 focus:border-zinc-700"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Recipe Name</TableHead>
              <TableHead className="text-zinc-400 text-center">Ingredients</TableHead>
              <TableHead className="text-zinc-400 text-right">Serving Unit</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-zinc-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin mb-1 opacity-30" />
                  Loading recipes...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-48 text-center text-zinc-500">
                  <ChefHat className="mx-auto h-8 w-8 mb-2 opacity-20" />
                  No recipes found. Create one to analyze food costs.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((recipe) => (
                <TableRow key={recipe.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell className="font-medium text-zinc-100">
                    <Link href={`/recipes/${recipe.id}`} className="hover:text-blue-400 transition-colors">
                      {recipe.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center text-zinc-400">
                    {recipe.ingredient_count} items
                  </TableCell>
                  <TableCell className="text-right text-zinc-500 text-xs uppercase tracking-wider">
                    {recipe.unit}
                  </TableCell>
                  <TableCell>
                    <Link href={`/recipes/${recipe.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-100">
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
