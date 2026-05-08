'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, MailCheck } from 'lucide-react'

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    orgName: '',
    outletName: '',
  })
  const [loading, setLoading] = useState(false)
  // null = form, 'email_confirm' = awaiting email, 'done' = logged in
  const [step, setStep] = useState<'form' | 'email_confirm'>('form')

  const router = useRouter()
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // ── Step 1: Create Supabase Auth user ───────────────────────────────
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: { full_name: formData.fullName },
        },
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('Failed to create user account.')

      // ── Step 2: Call atomic DB function (bypasses RLS) ──────────────────
      const { error: rpcError } = await supabase.rpc('register_new_org', {
        p_user_id:     authData.user.id,
        p_full_name:   formData.fullName,
        p_org_name:    formData.orgName,
        p_outlet_name: formData.outletName,
      })

      if (rpcError) throw rpcError

      // ── Step 3: Route based on whether email confirmation is required ────
      if (authData.session) {
        // Email confirmation is disabled — user is already logged in
        toast.success('Account created! Welcome to ByteSuite.')
        router.push('/')
      } else {
        // Email confirmation is required — show the check-your-email screen
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

  // ── Email confirmation pending screen ──────────────────────────────────────
  if (step === 'email_confirm') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#3e3e3e,transparent)] pointer-events-none" />
        <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur-xl text-zinc-100">
          <CardHeader className="items-center space-y-3 pt-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800">
              <MailCheck className="h-7 w-7 text-zinc-100" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-center">
              Check your email
            </CardTitle>
            <CardDescription className="text-center text-zinc-400">
              We sent a confirmation link to{' '}
              <span className="font-medium text-zinc-200">{formData.email}</span>.
              Click it to activate your account, then come back and sign in.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-3 pb-8">
            <Button
              className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              onClick={() => router.push('/login')}
            >
              Go to Sign In
            </Button>
            <p className="text-center text-xs text-zinc-500">
              Didn&apos;t receive it? Check your spam folder or{' '}
              <button
                type="button"
                className="text-zinc-400 underline hover:text-zinc-200"
                onClick={() => setStep('form')}
              >
                try again
              </button>
              .
            </p>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // ── Registration form ──────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#3e3e3e,transparent)] pointer-events-none" />

      <Card className="w-full max-w-lg border-zinc-800 bg-zinc-900/50 backdrop-blur-xl text-zinc-100">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Create an account
          </CardTitle>
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
                placeholder="Min. 6 characters"
                minLength={6}
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
