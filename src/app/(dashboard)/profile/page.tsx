'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Save, User } from 'lucide-react'
import { toast } from 'sonner'

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function loadProfile() {
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setEmail(user.email || '')
        
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
          
        if (profile) {
          setFullName(profile.full_name || '')
        }
      }
      
      setLoading(false)
    }

    loadProfile()
  }, [supabase])

  const handleSave = async () => {
    setSaving(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('user_profiles')
        .update({ full_name: fullName })
        .eq('id', user.id)

      if (error) throw error

      toast.success('Profile updated successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Your Profile</h2>
        <p className="text-zinc-400 text-sm">Manage your account settings and personal information.</p>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
              <User className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-medium text-zinc-100">Personal Information</CardTitle>
              <CardDescription className="text-zinc-400">Update your name and view your registered email.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-300">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              disabled
              className="bg-zinc-950/50 border-zinc-800 text-zinc-500"
            />
            <p className="text-xs text-zinc-500">Your email address cannot be changed.</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-zinc-300">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-zinc-600"
              placeholder="Enter your full name"
            />
          </div>

          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200 mt-4"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
