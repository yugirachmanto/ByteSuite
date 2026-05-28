'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff, MailCheck } from 'lucide-react'
import Link from 'next/link'

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    orgName: '',
    outletName: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'email_confirm'>('form')

  const router = useRouter()
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: { full_name: formData.fullName },
        },
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('Failed to create user account.')

      const { error: rpcError } = await supabase.rpc('register_new_org', {
        p_user_id:     authData.user.id,
        p_full_name:   formData.fullName,
        p_org_name:    formData.orgName,
        p_outlet_name: formData.outletName,
      })

      if (rpcError) throw rpcError

      if (authData.session) {
        toast.success('Account created! Welcome to ByteSuite.')
        router.push('/dashboard')
      } else {
        setStep('email_confirm')
      }
    } catch (error: any) {
      console.error('Registration error:', error)
      const msg =
        error?.message ||
        (error?.details ? `${error.details}` : null) ||
        'Registration failed. Please try again.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }))
  }

  if (step === 'email_confirm') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-[400px] space-y-8 text-center">
          <Link href="/" className="inline-block mb-6">
            <span className="text-2xl font-bold tracking-tight">ByteSuite</span>
          </Link>
          
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <MailCheck className="h-8 w-8 text-foreground" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">Check your inbox</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We sent a confirmation link to{' '}
              <span className="font-medium text-foreground">{formData.email}</span>.
              Click it to activate your account, then come back and sign in.
            </p>
          </div>

          <Button className="w-full h-11" onClick={() => router.push('/login')}>
            Go to Sign In
          </Button>

          <p className="text-xs text-muted-foreground">
            Didn&apos;t receive it? Check your spam folder or{' '}
            <button
              type="button"
              className="text-foreground hover:underline"
              onClick={() => setStep('form')}
            >
              try again
            </button>
            .
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 py-12">
      <div className="w-full max-w-[480px] space-y-8">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-block mb-6">
            <span className="text-2xl font-bold tracking-tight">ByteSuite</span>
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Create an account</h1>
          <p className="text-sm text-muted-foreground">Set up your organization and first outlet to get started</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  placeholder="John Doe"
                  required
                  value={formData.fullName}
                  onChange={handleChange}
                  className="h-11"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min. 6 characters"
                    minLength={6}
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="h-11 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  placeholder="Acme F&B Group"
                  required
                  value={formData.orgName}
                  onChange={handleChange}
                  className="h-11"
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
                  className="h-11"
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full h-11">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Account
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in instead
          </Link>
        </p>
      </div>
    </div>
  )
}
