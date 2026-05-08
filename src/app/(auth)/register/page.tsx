'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    orgName: '',
    outletName: ''
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // 1. Sign up user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName
          }
        }
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('Failed to create user')

      // 2. Create organization
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: formData.orgName })
        .select()
        .single()

      if (orgError) throw orgError

      // 3. Create outlet
      const { data: outletData, error: outletError } = await supabase
        .from('outlets')
        .insert({ 
          org_id: orgData.id,
          name: formData.outletName 
        })
        .select()
        .single()

      if (outletError) throw outletError

      // 4. Update user profile
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          org_id: orgData.id,
          full_name: formData.fullName,
          role: 'owner',
          outlet_ids: [outletData.id]
        })

      if (profileError) throw profileError

      toast.success('Account created successfully!')
      router.push('/login')
    } catch (error: any) {
      console.error("Registration error details:", error);
      const errorMsg = error.message + (error.details ? ` (${error.details})` : '');
      toast.error(errorMsg || 'Failed to register')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#3e3e3e,transparent)] pointer-events-none" />
      
      <Card className="w-full max-w-lg border-zinc-800 bg-zinc-900/50 backdrop-blur-xl text-zinc-100">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">Create an account</CardTitle>
          <CardDescription className="text-zinc-400">
            Set up your organization and first outlet to get started
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="John Doe"
                required
                value={formData.fullName}
                onChange={handleChange}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                required
                value={formData.email}
                onChange={handleChange}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                placeholder="Acme F&B Group"
                required
                value={formData.orgName}
                onChange={handleChange}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outletName">First Outlet Name</Label>
              <Input
                id="outletName"
                placeholder="Grand Central Cafe"
                required
                value={formData.outletName}
                onChange={handleChange}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-700"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit" 
              className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
            <p className="text-center text-sm text-zinc-500">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="text-zinc-100 hover:underline font-medium"
              >
                Sign in
              </button>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
