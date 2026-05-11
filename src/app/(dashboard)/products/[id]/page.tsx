'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  ArrowLeft, Save, Plus, Trash2, Calculator, Info, Settings, 
  History, TrendingUp, Package, Tag, Layers, CheckCircle2, 
  Loader2, Search, ScrollText, Image as ImageIcon, Camera, Upload, DollarSign
} from 'lucide-react'
import { toast } from 'sonner'
import { formatRp, tierColors, tierLabels } from '@/lib/format'

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [product, setProduct] = useState<any>(null)
  const [price, setPrice] = useState<number>(0)
  const [bom, setBom] = useState<any[]>([])
  const [allInventory, setAllInventory] = useState<any[]>([])
  
  // Search for BOM ingredients
  const [ingredientSearch, setIngredientSearch] = useState('')
  const [showIngredientResults, setShowIngredientResults] = useState(false)
  const [showImageExpand, setShowImageExpand] = useState(false)

  const fetchData = useCallback(async () => {
    if (!selectedOutletId || !params.id) return
    setLoading(true)
    try {
      // 1. Fetch Product Detail
      const { data: item, error: itemError } = await supabase
        .from('item_master')
        .select('*')
        .eq('id', params.id)
        .single()
      
      if (itemError) {
        console.error('PRODUCT DETAIL ERROR:', itemError)
        throw itemError
      }
      setProduct(item)

      // 2. Fetch Price for this outlet (handling missing price record gracefully)
      const { data: priceData, error: priceError } = await supabase
        .from('product_prices')
        .select('selling_price')
        .eq('outlet_id', selectedOutletId)
        .eq('item_id', params.id)
        .maybeSingle()
      
      if (priceError) throw priceError
      setPrice(priceData?.selling_price || 0)

      // 3. Fetch BOM (Recipe) with current inventory values for cost calculation
      const { data: bomData, error: bomError } = await supabase
        .from('bom')
        .select(`
          *, 
          component:item_master!bom_input_item_id_fkey(
            id, 
            name, 
            unit,
            inventory_balance!left(qty_on_hand, inventory_value)
          )
        `)
        .eq('output_item_id', params.id)
        .eq('component.inventory_balance.outlet_id', selectedOutletId)
      
      if (bomError) {
        console.error('BOM FETCH ERROR:', bomError)
        throw bomError
      }
      setBom(bomData || [])

      // 4. Fetch all inventory items for ingredient selection
      const { data: items, error: itemsError } = await supabase
        .from('item_master')
        .select('id, name, unit')
        .neq('id', params.id) // Can't add itself as ingredient
        .order('name')
      
      if (itemsError) {
        console.error('Error fetching inventory items:', itemsError)
        throw itemsError
      }
      setAllInventory(items || [])

    } catch (error: any) {
      toast.error('Failed to load product details')
      console.error('FATAL PRODUCT FETCH ERROR:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, selectedOutletId, params.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const fileExt = file.name.split('.').pop()
    const fileName = `${product.id}-${Math.random()}.${fileExt}`
    const filePath = `${fileName}`

    try {
      setSaving(true)
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from('item_master')
        .update({ image_url: publicUrl })
        .eq('id', product.id)

      if (updateError) throw updateError
      
      setProduct({ ...product, image_url: publicUrl })
      toast.success('Product image updated')
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload image')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveBasic = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('item_master')
        .update({
          name: product.name,
          code: product.code,
          unit: product.unit,
          purchase_unit: product.purchase_unit || product.unit,
          conversion_factor: product.conversion_factor || 1
        })
        .eq('id', product.id)
      
      if (error) throw error

      // Save/Update Price
      const { error: priceError } = await supabase
        .from('product_prices')
        .upsert({
          org_id: product.org_id,
          outlet_id: selectedOutletId,
          item_id: product.id,
          selling_price: price
        }, { onConflict: 'outlet_id,item_id' })
      
      if (priceError) throw priceError

      toast.success('Product details and price updated')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleAddIngredient = async (item: any) => {
    try {
      const { data, error } = await supabase
        .from('bom')
        .insert({
          org_id: product.org_id,
          output_item_id: product.id,
          input_item_id: item.id,
          qty_per_unit: 1,
          unit: item.unit
        })
        .select('*, component:item_master!bom_input_item_id_fkey(id, name, unit, inventory_balance!left(qty_on_hand, inventory_value))')
        .single()
      
      if (error) throw error
      
      setBom(prev => [...prev, data])
      setIngredientSearch('')
      setShowIngredientResults(false)
      toast.success(`${item.name} added to recipe`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to add ingredient')
    }
  }

  const handleRemoveIngredient = async (bomId: string) => {
    try {
      const { error } = await supabase
        .from('bom')
        .delete()
        .eq('id', bomId)
      
      if (error) throw error
      setBom(prev => prev.filter(b => b.id !== bomId))
      toast.success('Ingredient removed')
    } catch (error: any) {
      toast.error('Failed to remove ingredient')
    }
  }

  const handleUpdateBomQty = async (bomId: string, qty: number) => {
    try {
      const { error } = await supabase
        .from('bom')
        .update({ qty_per_unit: qty })
        .eq('id', bomId)
      
      if (error) throw error
      setBom(prev => prev.map(b => b.id === bomId ? { ...b, qty_per_unit: qty } : b))
    } catch (error: any) {
      toast.error('Failed to update quantity')
    }
  }

  if (loading) return <div className="flex h-48 items-center justify-center text-zinc-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...</div>
  if (!product) return <div className="p-8 text-center text-zinc-500">Product not found.</div>

  const ingredientCostTotal = bom.reduce((sum, b) => {
    const balance = b.component?.inventory_balance?.[0]
    if (!balance || balance.qty_on_hand <= 0) return sum
    const avgCost = balance.inventory_value / balance.qty_on_hand
    return sum + (b.qty_per_unit * avgCost)
  }, 0)

  const indirectCost = ingredientCostTotal * 0.1
  const estimatedHpp = ingredientCostTotal + indirectCost
  const margin = price - estimatedHpp

  const filteredIngredients = allInventory.filter(item => 
    item.name.toLowerCase().includes(ingredientSearch.toLowerCase()) &&
    !bom.some(b => b.component_item_id === item.id)
  ).slice(0, 5)

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] overflow-hidden space-y-4 lg:space-y-6">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/products')} className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">{product.name}</h1>
            <p className="text-zinc-500 text-xs">Product Detail & Recipe Management</p>
          </div>
        </div>
        <Button onClick={handleSaveBasic} disabled={saving} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden min-h-0">
        {/* Left: General Info & Pricing */}
        <div className="lg:col-span-5 space-y-4 flex flex-col overflow-y-auto custom-scrollbar pr-1">
          <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm border-l-4 border-l-blue-500/50 flex-shrink-0">
            <CardHeader className="py-3 px-4 border-b border-zinc-800/50">
              <CardTitle className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Info className="h-4 w-4 text-zinc-500" /> Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex gap-4">
                {/* Photo in Section */}
                <div className="group relative h-20 w-20 flex-shrink-0 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden cursor-pointer" onClick={() => setShowImageExpand(true)}>
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.name} 
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" 
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-800">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                    <Camera className="h-3 w-3 text-white mb-1" />
                    <span className="text-[7px] font-bold text-white uppercase tracking-tighter">Change</span>
                  </div>
                </div>

                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Product Name</label>
                      <Input 
                        value={product.name} 
                        onChange={e => setProduct({...product, name: e.target.value})}
                        className="h-7 bg-zinc-950 border-zinc-800 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">SKU / Code</label>
                      <Input 
                        value={product.code || ''} 
                        onChange={e => setProduct({...product, code: e.target.value})}
                        className="h-7 bg-zinc-950 border-zinc-800 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Category</label>
                      <div className="flex">
                        <Badge variant="outline" className={`${tierColors[product.category] || ''} h-7 px-2 text-[9px]`}>
                          {tierLabels[product.category] || product.category || 'Basic'}
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Recipe Unit</label>
                      <Input 
                        value={product.unit} 
                        onChange={e => setProduct({...product, unit: e.target.value})}
                        className="h-7 bg-zinc-950 border-zinc-800 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm border-l-4 border-l-emerald-500/50 flex-shrink-0">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" /> Pricing & HPP
              </CardTitle>
              <CardDescription className="text-[10px]">Financial analysis based on ingredients and indirect costs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Selling Price (Rp)</label>
                <Input 
                  type="number"
                  value={price} 
                  onChange={e => setPrice(parseFloat(e.target.value) || 0)}
                  className="bg-zinc-950 border-zinc-800 h-12 text-xl font-mono text-emerald-400"
                />
              </div>

              {/* HPP Breakdown */}
              <div className="rounded-lg bg-zinc-950/50 border border-zinc-800 p-4 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500">Ingredient Cost</span>
                  <span className="text-zinc-200 font-mono">{formatRp(ingredientCostTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-500">Indirect Cost (10%)</span>
                  <span className="text-zinc-200 font-mono">{formatRp(indirectCost)}</span>
                </div>
                <div className="pt-2 border-t border-zinc-800 flex justify-between items-center">
                  <span className="text-sm font-bold text-zinc-400 uppercase">Estimated HPP</span>
                  <span className="text-lg font-bold text-zinc-100 font-mono">{formatRp(estimatedHpp)}</span>
                </div>
              </div>

              {/* Margin Analysis */}
              <div className={`rounded-lg p-4 flex flex-col items-center justify-center gap-1 ${margin >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Projected Margin</span>
                <span className={`text-2xl font-bold font-mono ${margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatRp(margin)}
                </span>
                <span className="text-xs text-zinc-500">
                  {price > 0 ? ((margin / price) * 100).toFixed(1) : 0}% Profit
                </span>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right: Recipe (BOM) */}
        <div className="lg:col-span-7 space-y-4 flex flex-col overflow-hidden">
          <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm border-l-4 border-l-purple-500/50 flex-1 flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 border-b border-zinc-800/50 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <ScrollText className="h-4 w-4 text-purple-500" /> Recipe (BOM)
                  </CardTitle>
                </div>
                <div className="text-[10px] text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 uppercase tracking-tighter">
                  Per 1 {product.unit}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
              <div className="p-3 border-b border-zinc-800/50 bg-black/20 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <Input 
                    placeholder="Search ingredients..." 
                    className="h-8 pl-8 bg-zinc-950 border-zinc-800 text-xs"
                    value={ingredientSearch}
                    onChange={(e) => {
                      setIngredientSearch(e.target.value)
                      setShowIngredientResults(true)
                    }}
                    onBlur={() => setTimeout(() => setShowIngredientResults(false), 200)}
                  />
                  
                  {showIngredientResults && ingredientSearch && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900 shadow-2xl custom-scrollbar">
                      {filteredIngredients.map(item => (
                        <div 
                          key={item.id}
                          className="flex items-center justify-between p-2 hover:bg-zinc-800 cursor-pointer border-b border-zinc-800/50 last:border-0"
                          onClick={() => handleAddIngredient(item)}
                        >
                          <span className="text-xs text-zinc-200">{item.name}</span>
                          <span className="text-[10px] text-zinc-500 uppercase">{item.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <Table>
                  <TableHeader className="bg-black/40 sticky top-0 z-10 border-b border-zinc-800">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] h-8 px-3 font-bold uppercase tracking-wider text-zinc-500">Ingredient</TableHead>
                      <TableHead className="text-[10px] h-8 px-3 font-bold uppercase tracking-wider text-zinc-500 text-right">Qty</TableHead>
                      <TableHead className="text-[10px] h-8 px-3 font-bold uppercase tracking-wider text-zinc-500 text-right">Cost</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bom.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-zinc-600 italic text-sm">
                          No ingredients yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      bom.map((b) => {
                        const balance = b.component?.inventory_balance?.[0]
                        const avgCost = balance ? balance.inventory_value / balance.qty_on_hand : 0
                        const rowCost = b.qty_per_unit * avgCost

                        return (
                          <TableRow key={b.id} className="border-zinc-800 hover:bg-zinc-800/20 group">
                            <TableCell className="py-2 px-3">
                              <p className="text-[11px] font-medium text-zinc-200">{b.component?.name}</p>
                              <p className="text-[9px] text-zinc-500 uppercase">{b.unit}</p>
                            </TableCell>
                            <TableCell className="py-2 px-3 text-right">
                              <input 
                                type="number"
                                value={b.qty_per_unit}
                                onChange={(e) => handleUpdateBomQty(b.id, parseFloat(e.target.value) || 0)}
                                className="w-12 bg-transparent text-right text-[11px] text-blue-400 focus:outline-none"
                              />
                            </TableCell>
                            <TableCell className="py-2 px-3 text-right text-[11px] font-mono text-zinc-400">
                              {formatRp(rowCost)}
                            </TableCell>
                            <TableCell className="py-2 px-3">
                              <button 
                                onClick={() => handleRemoveIngredient(b.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="p-4 bg-black/40 border-t border-zinc-800 space-y-3 flex-shrink-0">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Total Recipe Cost</span>
                  <span className="text-sm font-mono text-zinc-300">{formatRp(ingredientCostTotal)}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Projected Margin</span>
                  <span className={`text-xl font-bold font-mono ${margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(price > 0 ? (margin / price) * 100 : 0).toFixed(1)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Image Expand Dialog */}
      <Dialog open={showImageExpand} onOpenChange={setShowImageExpand}>
        <DialogContent className="bg-zinc-950 border-zinc-800 p-0 overflow-hidden sm:max-w-2xl">
          <div className="relative aspect-video w-full bg-zinc-950 flex items-center justify-center">
            {product.image_url ? (
              <img 
                src={product.image_url} 
                alt={product.name} 
                className="w-full h-full object-contain" 
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-800">
                <ImageIcon className="h-12 w-12" />
                <span className="text-xs font-bold uppercase tracking-widest">No Image</span>
              </div>
            )}
            
            <label className="absolute bottom-4 right-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer shadow-xl transition-all active:scale-95">
              <Upload className="h-4 w-4" />
              <span className="text-xs font-bold uppercase">Upload New Photo</span>
              <input 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={handleImageUpload}
                disabled={saving}
              />
            </label>

            {saving && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
