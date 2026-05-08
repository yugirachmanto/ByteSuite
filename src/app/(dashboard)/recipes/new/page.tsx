'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function NewRecipePage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('portion')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Recipe name is required')
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user?.id)
        .single()

      // Insert as a recipe item into item_master
      const { data, error } = await supabase
        .from('item_master')
        .insert({
          org_id: profile?.org_id,
          name,
          unit,
          category: 'recipe',
          is_inventory: false,
        })
        .select('id')
        .single()

      if (error) throw error

      toast.success('Recipe created! Now add ingredients.')
      router.push(`/recipes/${data.id}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to create recipe')
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/recipes">
          <Button variant="ghost" size="icon" className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Create Recipe</h2>
          <p className="text-zinc-400 text-sm">Define a new menu item for costing analysis.</p>
        </div>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Recipe Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Recipe / Menu Item Name</Label>
            <Input 
              className="bg-zinc-950 border-zinc-800"
              placeholder="e.g. Spaghetti Carbonara"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Serving Unit</Label>
            <Input 
              className="bg-zinc-950 border-zinc-800"
              placeholder="e.g. portion, glass, pax"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
            <p className="text-xs text-zinc-500">The unit of measure for one serving of this recipe.</p>
          </div>
          <div className="pt-4">
            <Button 
              className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Create & Continue to BOM
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
