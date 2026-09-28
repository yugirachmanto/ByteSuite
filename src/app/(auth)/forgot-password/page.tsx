'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, MailCheck, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/AuthShell'

const fieldClass = 'h-11 border-white/10 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-indigo-500/50 focus-visible:ring-indigo-500/20'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/setup-account`,
      })
      if (error) throw error

      setSubmitted(true)
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset link')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <AuthShell>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15">
            <MailCheck className="h-8 w-8 text-indigo-300" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-white">Check your email</h2>
            <p className="text-sm leading-relaxed text-zinc-400">
              We have sent a password recovery link to{' '}
              <span className="font-medium text-zinc-200">{email}</span>.
              Click the link in the email to reset your password.
            </p>
          </div>

          <Button
            className="h-11 w-full rounded-full bg-indigo-600 text-white shadow-[0_16px_40px_-12px_rgba(79,70,229,0.6)] hover:bg-indigo-500"
            onClick={() => router.push('/login')}
          >
            Return to Login
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-white">Forgot Password</h1>
        <p className="text-sm text-zinc-400">Enter your email and we will send you a reset link</p>
      </div>

      <form onSubmit={handleReset} className="mt-8 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-300">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-full bg-indigo-600 text-white shadow-[0_16px_40px_-12px_rgba(79,70,229,0.6)] hover:bg-indigo-500"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send Recovery Link
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link href="/login" className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to login
        </Link>
      </div>
    </AuthShell>
  )
}
