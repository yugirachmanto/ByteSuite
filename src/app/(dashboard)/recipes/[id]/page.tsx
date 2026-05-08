'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { ArrowLeft, Loader2, Save, ExternalLink, Calculator } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { formatRp, tierColors, tierLabels } from '@/lib/format'

interface RecipeIngredient {
  id: string
  input_item_id: string
  qty_per_unit: number
  unit: string
  item_master: {
    name: string
    category: string
  }
  estimatedCost: number
  hasStockInfo: boolean
}

export default function RecipeCostingPage() {
  const params = useParams()
  const router = useRouter()
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()

  const [recipe, setRecipe] = useState<any>(null)
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [loading, setLoading] = useState(true)
  const [targetMargin, setTargetMargin] = useState(30) // Default 30% Food Cost

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchRecipeData() {
      setLoading(true)
      
      // 1. Fetch recipe header
      const { data: recipeData, error: recipeError } = await supabase
        .from('item_master')
        .select('*')
        .eq('id', params.id)
        .single()

      if (recipeError || !recipeData || recipeData.category !== 'recipe') {
        toast.error('Recipe not found')
        router.push('/recipes')
        return
      }
      setRecipe(recipeData)

      // 2. Fetch BOM
      const { data: bomData } = await supabase
        .from('bom')
        .select(`
          id,
          input_item_id,
          qty_per_unit,
          unit,
          item_master!bom_input_item_id_fkey (
            name,
            category
          )
        `)
        .eq('output_item_id', recipeData.id)

      if (!bomData || bomData.length === 0) {
        setIngredients([])
        setLoading(false)
        return
      }

      // 3. Fetch Stock / Valuation for WAC calculation
      const itemIds = bomData.map(b => b.input_item_id)
      const { data: stockData } = await supabase
        .from('inventory_balance')
        .select('item_id, qty_on_hand, inventory_value')
        .eq('outlet_id', selectedOutletId)
        .in('item_id', itemIds)

      // Map stock to items to calculate unit cost
      const costMap: Record<string, number> = {}
      stockData?.forEach(s => {
        if (s.qty_on_hand > 0) {
          costMap[s.item_id] = s.inventory_value / s.qty_on_hand
        } else {
          costMap[s.item_id] = 0
        }
      })

      const enriched: RecipeIngredient[] = bomData.map((b: any) => ({
        ...b,
        estimatedCost: (costMap[b.input_item_id] || 0) * b.qty_per_unit,
        hasStockInfo: b.input_item_id in costMap
      }))

      setIngredients(enriched)
      setLoading(false)
    }

    fetchRecipeData()
  }, [params.id, selectedOutletId, supabase, router])

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    )
  }

  const theoreticalCost = ingredients.reduce((sum, item) => sum + item.estimatedCost, 0)
  const suggestedPrice = targetMargin > 0 ? theoreticalCost / (targetMargin / 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/recipes')} className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">{recipe?.name}</h2>
            <p className="text-zinc-400 text-sm">Recipe Costing & Pricing Analysis</p>
          </div>
        </div>
        <Link href={`/settings/bom?item=${recipe?.id}`}>
          <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-300">
            <ExternalLink className="mr-2 h-4 w-4" />
            Edit BOM
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Summary & Pricing */}
        <div className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-3 border-b border-zinc-800/50">
              <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Pricing Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div>
                <Label className="text-zinc-500 text-xs uppercase font-bold">Theoretical Cost per {recipe?.unit}</Label>
                <div className="text-3xl font-bold text-zinc-100 mt-1">
                  {formatRp(theoreticalCost)}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Target Food Cost (%)</Label>
                  <span className="text-xs text-zinc-500 font-medium">{targetMargin}%</span>
                </div>
                <Input 
                  type="range" 
                  min="10" 
                  max="100" 
                  value={targetMargin} 
                  onChange={(e) => setTargetMargin(parseInt(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 px-1">
                  <span>10% (Premium)</span>
                  <span>100% (At Cost)</span>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <Label className="text-zinc-500 text-xs uppercase font-bold">Suggested Selling Price</Label>
                <div className="text-3xl font-bold text-emerald-400 mt-1">
                  {formatRp(suggestedPrice)}
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  At {targetMargin}% food cost, your gross margin is {100 - targetMargin}%.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Ingredients Breakdown */}
        <Card className="lg:col-span-2 border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
              Cost Breakdown (BOM)
            </CardTitle>
            <span className="text-xs text-zinc-500">Based on current average inventory costs</span>
          </CardHeader>
          <CardContent className="p-0">
            {ingredients.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-sm p-6 text-center">
                <p>This recipe has no ingredients defined.</p>
                <Button variant="link" className="text-blue-400" onClick={() => router.push(`/settings/bom?item=${recipe?.id}`)}>
                  Go to BOM Settings to add ingredients
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader className="border-zinc-800">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-zinc-500 text-xs uppercase font-bold">Ingredient</TableHead>
                    <TableHead className="text-zinc-500 text-xs uppercase font-bold text-right">Qty / {recipe?.unit}</TableHead>
                    <TableHead className="text-zinc-500 text-xs uppercase font-bold text-right">Unit Cost (Avg)</TableHead>
                    <TableHead className="text-zinc-500 text-xs uppercase font-bold text-right">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredients.map((item) => (
                    <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/20">
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-zinc-100">{item.item_master.name}</span>
                          <Badge variant="outline" className={`w-fit text-[10px] py-0 h-4 ${tierColors[item.item_master.category]}`}>
                            {tierLabels[item.item_master.category] || item.item_master.category}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-zinc-300 font-mono">
                        {item.qty_per_unit} <span className="text-zinc-500 text-xs">{item.unit}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.hasStockInfo ? (
                          <span className="text-zinc-400 font-mono">
                            {item.qty_per_unit > 0 ? formatRp(item.estimatedCost / item.qty_per_unit) : 'Rp 0'}
                          </span>
                        ) : (
                          <span className="text-amber-500 text-xs">No Stock Data</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold text-zinc-100 font-mono">
                        {formatRp(item.estimatedCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-zinc-900/80 hover:bg-zinc-900/80 border-t-2 border-zinc-800">
                    <TableCell colSpan={3} className="text-right font-bold text-zinc-400 uppercase text-xs">
                      Total Theoretical Cost
                    </TableCell>
                    <TableCell className="text-right font-bold text-zinc-100 font-mono text-lg">
                      {formatRp(theoreticalCost)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
