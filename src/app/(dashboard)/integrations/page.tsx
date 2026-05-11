'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Bot, 
  Save, 
  Loader2, 
  ShieldCheck, 
  Eye, 
  EyeOff,
  ExternalLink,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'

export default function IntegrationsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<'connected' | 'not_configured' | 'error'>('not_configured')

  useEffect(() => {
    async function fetchIntegration() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('user_integrations')
        .select('credentials, is_active')
        .eq('user_id', user.id)
        .eq('provider', 'openai')
        .single()

      if (data && data.credentials) {
        setApiKey((data.credentials as any).api_key || '')
        setStatus(data.is_active ? 'connected' : 'not_configured')
      }
      setLoading(false)
    }
    fetchIntegration()
  }, [supabase])

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast.error('API Key cannot be empty')
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: user.id,
          provider: 'openai',
          credentials: { api_key: apiKey.trim() },
          is_active: true
        }, { onConflict: 'user_id, provider' })

      if (error) throw error

      toast.success('API Key saved successfully!')
      setStatus('connected')
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to save API Key')
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2 opacity-30" />
        Loading integrations...
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-100">Integrations</h2>
        <p className="text-zinc-400 mt-1">Connect ByteSuite to external AI and automation services.</p>
      </div>

      <div className="grid gap-6">
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-zinc-100">OpenAI (GPT-4o)</CardTitle>
                {status === 'connected' ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-zinc-500 border-zinc-800">
                    Not Configured
                  </Badge>
                )}
              </div>
              <CardDescription className="text-zinc-400 max-w-md">
                Used for high-precision extraction of line items and tax data from invoices.
              </CardDescription>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
              <Bot className="h-6 w-6" />
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="api-key" className="text-zinc-200">OpenAI API Key</Label>
                  <a 
                    href="https://platform.openai.com/api-keys" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    Get your API Key <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="relative group/input">
                  <Input
                    id="api-key"
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 pr-10 focus:border-blue-500/50 transition-all"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-950 border border-zinc-800/50 mt-4">
                  <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Your API key is stored securely in your private organization vault. 
                    It is never shared with other organizations or users outside your tenant.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button 
                  onClick={handleSave} 
                  disabled={saving}
                  className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 min-w-[120px]"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Configuration
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 opacity-60 grayscale cursor-not-allowed">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-zinc-100">WhatsApp Notification</CardTitle>
              <CardDescription className="text-zinc-400">
                Send automatic stock alerts and order receipts via WhatsApp.
              </CardDescription>
            </div>
            <div className="p-3 rounded-xl bg-zinc-800 text-zinc-500">
              <AlertCircle className="h-6 w-6" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-600">Coming Soon</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
