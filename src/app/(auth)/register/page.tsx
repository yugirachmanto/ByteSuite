'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff, MailCheck } from 'lucide-react'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/AuthShell'

const fieldClass = 'h-11 border-white/10 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20'

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    orgName: '',
    outletName: '',
    coaTemplate: 'default',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'email_confirm'>('form')

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      const search = window.location.search
      const hasForwarded = sessionStorage.getItem('setup_forwarded')

      if (!hasForwarded && (
        hash.includes('access_token=') ||
        hash.includes('type=invite') ||
        hash.includes('type=recovery') ||
        hash.includes('type=signup') ||
        search.includes('code=') ||
        search.includes('token_hash=')
      )) {
        sessionStorage.setItem('setup_forwarded', 'true')
        window.location.href = '/setup-account' + search + hash
      }
    }
  }, [])

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
        p_coa_template: formData.coaTemplate,
      })

      if (rpcError) throw rpcError

      if (authData.session) {
        toast.success('Account created! Welcome to ByteSuite.')
        router.push('/onboarding')
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
      <AuthShell activePage="register">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15">
            <MailCheck className="h-8 w-8 text-indigo-300" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-white">Check your inbox</h2>
            <p className="text-sm leading-relaxed text-zinc-400">
              We sent a confirmation link to{' '}
              <span className="font-medium text-zinc-200">{formData.email}</span>.
              Click it to activate your account, then come back and sign in.
            </p>
          </div>

          <Button
            className="h-11 w-full rounded-full bg-indigo-600 text-white shadow-[0_16px_40px_-12px_rgba(79,70,229,0.6)] hover:bg-indigo-500"
            onClick={() => router.push('/login')}
          >
            Go to Sign In
          </Button>

          <p className="text-xs text-zinc-500">
            Didn&apos;t receive it? Check your spam folder or{' '}
            <button
              type="button"
              className="text-zinc-300 hover:underline"
              onClick={() => setStep('form')}
            >
              try again
            </button>
            .
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell activePage="register">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-white">Create an account</h1>
        <p className="text-sm text-zinc-400">Set up your organization and first outlet to get started</p>
      </div>

      <form onSubmit={handleRegister} className="mt-8 space-y-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-zinc-300">Full Name</Label>
              <Input
                id="fullName"
                placeholder="John Doe"
                required
                value={formData.fullName}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                required
                value={formData.email}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  minLength={6}
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className={`${fieldClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="orgName" className="text-zinc-300">Organization Name</Label>
              <Input
                id="orgName"
                placeholder="Acme F&B Group"
                required
                value={formData.orgName}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="outletName" className="text-zinc-300">First Outlet Name</Label>
              <Input
                id="outletName"
                placeholder="Grand Central Cafe"
                required
                value={formData.outletName}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coaTemplate" className="text-zinc-300">Chart of Accounts Template</Label>
            <select
              id="coaTemplate"
              value={formData.coaTemplate}
              onChange={(e) => setFormData((prev) => ({ ...prev, coaTemplate: e.target.value }))}
              className="flex h-11 w-full rounded-lg border border-white/10 bg-zinc-950/50 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="default">Default ByteSuite (~200 akun standar F&amp;B)</option>
              <option value="kl">Kopitiam Lim (struktur COA custom)</option>
            </select>
            <p className="text-xs text-zinc-500">Bisa disesuaikan lagi kapan saja lewat Settings setelah akun dibuat.</p>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-full bg-indigo-600 text-white shadow-[0_16px_40px_-12px_rgba(79,70,229,0.6)] hover:bg-indigo-500"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-400">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-zinc-100 hover:underline">
          Sign in instead
        </Link>
      </p>
    </AuthShell>
  )
}
