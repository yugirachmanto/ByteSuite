'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { 
  Loader2, 
  ArrowLeft, 
  Save, 
  Tag,
  Info,
  Layers
} from 'lucide-react'
import { toast } from 'sonner'

export default function NewProductPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [coa, setCoa] = useState<any[]>([])
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    unit: 'pcs',
    default_coa_id: ''
  })

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()
      
      setOrgId(profile?.org_id)

      if (profile?.org_id) {
        const { data: accounts } = await supabase
          .from('chart_of_accounts')
          .select('id, code, name')
          .eq('org_id', profile.org_id)
          .eq('is_active', true)
          .order('code')
        
        setCoa(accounts || [])
      }
    }
    fetchData()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      toast.error('Product name is required')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('item_master')
        .insert({
          org_id: orgId,
          name: formData.name,
          code: formData.code,
          unit: formData.unit,
          category: 'finished',
          default_coa_id: formData.default_coa_id || null,
          is_inventory: true
        })
        .select()
        .single()
      
      if (error) throw error

      toast.success('Product created successfully')
      router.push(`/products/${data.id}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to create product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/products')} className="text-zinc-400">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Add New Product</h2>
          <p className="text-zinc-400 text-sm">Create a new finished item for your menu.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm shadow-xl">
          <CardHeader className="border-b border-zinc-800/50">
            <CardTitle className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Info className="h-4 w-4 text-zinc-500" /> Basic Information
            </CardTitle>
            <CardDescription>Enter the essential details of your new menu item.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Product Name *</label>
              <Input 
                placeholder="e.g. Avocado Toast"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="bg-zinc-950 border-zinc-800 h-11 text-zinc-100"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Product Code</label>
                <Input 
                  placeholder="e.g. FOOD-001"
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value})}
                  className="bg-zinc-950 border-zinc-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Unit</label>
                <Input 
                  placeholder="e.g. pcs, cup, portion"
                  value={formData.unit}
                  onChange={e => setFormData({...formData, unit: e.target.value})}
                  className="bg-zinc-950 border-zinc-800"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider flex items-center gap-2">
                <Layers className="h-3 w-3" /> Default COA (Optional)
              </label>
              <select 
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 h-11 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                value={formData.default_coa_id}
                onChange={e => setFormData({...formData, default_coa_id: e.target.value})}
              >
                <option value="">No Default Account</option>
                {coa.map(acc => <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>)}
              </select>
              <p className="text-[10px] text-zinc-500">Mapping to an income account helps with automated sales journalization.</p>
            </div>

            <div className="pt-4 flex gap-3">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => router.push('/products')} 
                className="flex-1 border-zinc-800 bg-zinc-900 text-zinc-300"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading}
                className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 shadow-lg shadow-zinc-100/10"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Create Product
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
