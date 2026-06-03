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
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-[400px] space-y-8 text-center">
          <Link href="/" className="inline-block mb-6">
            <span className="text-2xl font-bold tracking-tight">ByteSuite</span>
          </Link>
          
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <MailCheck className="h-8 w-8 text-foreground" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">Check your email</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We have sent a password recovery link to{' '}
              <span className="font-medium text-foreground">{email}</span>.
              Click the link in the email to reset your password.
            </p>
          </div>

          <Button className="w-full h-11" onClick={() => router.push('/login')}>
            Return to Login
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px] space-y-8">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-block mb-6">
            <span className="text-2xl font-bold tracking-tight">ByteSuite</span>
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Forgot Password</h1>
          <p className="text-sm text-muted-foreground">Enter your email and we will send you a reset link</p>
        </div>

        <form onSubmit={handleReset} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full h-11">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Recovery Link
          </Button>
        </form>

        <div className="text-center">
          <Link href="/login" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
