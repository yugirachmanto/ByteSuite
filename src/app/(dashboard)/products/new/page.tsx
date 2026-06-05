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
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [coa, setCoa] = useState<any[]>([])
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    unit: 'PCS',
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
          .select('id, code, name, is_header')
          .eq('org_id', profile.org_id)
          .eq('is_active', true)
          .order('code')
        
        setCoa(accounts || [])
      }
    }
    fetchData()
  }, [supabase])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `product-${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName)
      setImageUrl(publicUrl)
      toast.success('Image uploaded successfully')
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload image')
    } finally {
      setUploadingImage(false)
    }
  }

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
          is_inventory: true,
          image_url: imageUrl || null
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
              <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Product Image</label>
              <div className="flex flex-col gap-4">
                {imageUrl ? (
                  <div className="relative w-32 h-32 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden group">
                    <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500/80 text-white rounded-md opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Loader2 className="h-4 w-4 hidden" />
                      <span className="text-xs font-bold px-1">X</span>
                    </button>
                  </div>
                ) : null}
                <label className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 rounded-lg px-4 py-2.5 cursor-pointer transition-colors w-fit">
                  {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : <div className="h-4 w-4 text-zinc-400 font-bold">+</div>}
                  <span className="text-sm text-zinc-300">{imageUrl ? 'Replace Image' : 'Upload Image'}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    disabled={uploadingImage}
                    onChange={handleImageUpload}
                  />
                </label>
              </div>
            </div>

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
                <select 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 h-11 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                  value={formData.unit}
                  onChange={e => setFormData({...formData, unit: e.target.value})}
                >
                  <option value="PCS">PCS</option>
                  <option value="PORTION">PORTION</option>
                  <option value="CUP">CUP</option>
                  <option value="BOWL">BOWL</option>
                  <option value="PLATE">PLATE</option>
                  <option value="KG">KG</option>
                  <option value="GR">GR</option>
                  <option value="LTR">LTR</option>
                  <option value="ML">ML</option>
                  <option value="BOX">BOX</option>
                  <option value="PACK">PACK</option>
                </select>
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
                {coa.map(acc => (
                  <option 
                    key={acc.id} 
                    value={acc.id} 
                    disabled={acc.is_header}
                    className={acc.is_header ? "font-bold text-zinc-500 bg-zinc-900" : ""}
                  >
                    {acc.code} - {acc.name} {acc.is_header ? '(Header - Cannot Select)' : ''}
                  </option>
                ))}
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
