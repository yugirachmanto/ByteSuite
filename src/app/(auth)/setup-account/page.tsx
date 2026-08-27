'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'

export default function SetupAccountPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let mounted = true

    const fetchProfile = async (userId: string, userEmail?: string) => {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('setup_forwarded')
      }
      
      if (userEmail && mounted) {
        setEmail(userEmail)
      }
      
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', userId)
        .single()
      
      if (profile?.full_name && mounted) {
        const cleanName = profile.full_name.startsWith('[INVITED] ')
          ? profile.full_name.replace('[INVITED] ', '')
          : profile.full_name
        setFullName(cleanName === 'Unnamed User' || cleanName === 'New User' ? '' : cleanName)
      }
      if (mounted) setPageLoading(false)
    }

    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user && mounted) {
        setUser(session.user)
        fetchProfile(session.user.id, session.user.email)
      }
    }

    const handleAuthFlow = async () => {
      if (typeof window === 'undefined') return
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const tokenHash = params.get('token_hash')
      const type = params.get('type') as any

      // Implicit-flow invite/recovery links carry #access_token=...&refresh_token=...
      // in the hash fragment, which the server never sees. Parse and exchange it
      // explicitly rather than racing the Supabase SDK's automatic detectSessionInUrl
      // listener against the initSession() fallback below.
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error && data.session && mounted) {
          setUser(data.session.user)
          fetchProfile(data.session.user.id, data.session.user.email)
          window.history.replaceState({}, document.title, window.location.pathname)
          return
        }
      } else if (tokenHash && type) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        if (!error && data.session && mounted) {
          setUser(data.session.user)
          fetchProfile(data.session.user.id, data.session.user.email)
          window.history.replaceState({}, document.title, window.location.pathname)
          return
        }
      } else if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (!error && data.session && mounted) {
          setUser(data.session.user)
          fetchProfile(data.session.user.id, data.session.user.email)
          window.history.replaceState({}, document.title, window.location.pathname)
          return
        }
      }

      initSession()
    }

    handleAuthFlow()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && mounted) {
        setUser(session.user)
        fetchProfile(session.user.id, session.user.email)
      }
    })

    // Fallback: if after 6 seconds we still don't have a user, prompt login
    const timer = setTimeout(() => {
      if (mounted && pageLoading) {
        supabase.auth.getSession().then(({ data }) => {
          if (!data.session?.user && mounted) {
            toast.error('Invalid or expired invitation link. Please request a new invite or log in.')
            setPageLoading(false)
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('setup_forwarded')
              window.location.href = '/login'
            }
          } else if (data.session?.user && mounted) {
            setUser(data.session.user)
            fetchProfile(data.session.user.id, data.session.user.email)
          }
        })
      }
    }, 6000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [supabase, router])

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      // Update password in auth
      const { error: updateAuthError } = await supabase.auth.updateUser({
        password: password
      })
      
      if (updateAuthError) throw updateAuthError

      // Update name in profile
      if (user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .update({ full_name: fullName })
          .eq('id', user.id)

        if (profileError) throw profileError
      }

      toast.success('Account set up successfully! Welcome to ByteSuite.')
      router.push('/dashboard')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to setup account')
    } finally {
      setLoading(false)
    }
  }

  if (pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
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
          <h1 className="text-3xl font-semibold tracking-tight">Complete Setup</h1>
          <p className="text-sm text-muted-foreground">Welcome! Please set your name and password to activate your account.</p>
        </div>

        <form onSubmit={handleSetup} className="space-y-6">
          <div className="space-y-4">
            {email && (
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="h-11 bg-zinc-900/50 text-zinc-400 border-zinc-800 cursor-not-allowed"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Enter your full name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a secure password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 pr-11"
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save and Continue
          </Button>
        </form>
      </div>
    </div>
  )
}
