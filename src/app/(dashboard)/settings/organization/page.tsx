'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Building2, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

interface OrgForm {
  name: string
  address: string
  phone: string
  npwp: string
  logo_url: string
}

const emptyForm: OrgForm = { name: '', address: '', phone: '', npwp: '', logo_url: '' }

export default function OrganizationSettingsPage() {
  const supabase = createClient()
  const { t } = useLanguage()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [form, setForm] = useState<OrgForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) { setLoading(false); return }
      setOrgId(profile.org_id)

      const { data: org } = await supabase.from('organizations').select('name, address, phone, npwp, logo_url').eq('id', profile.org_id).single()
      if (org) {
        setForm({
          name: org.name || '',
          address: org.address || '',
          phone: org.phone || '',
          npwp: org.npwp || '',
          logo_url: org.logo_url || '',
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    if (!orgId) return
    if (!form.name.trim()) {
      toast.error(t('settings.organization.errNameRequired'))
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('organizations').update({
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        npwp: form.npwp.trim() || null,
        logo_url: form.logo_url.trim() || null,
      }).eq('id', orgId)
      if (error) throw error
      toast.success(t('settings.organization.successSaved'))
    } catch (err: any) {
      toast.error(err.message || t('settings.organization.errFailedSave'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm"><Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-30" />{t('common.loading')}</div>

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">{t('settings.organization.title')}</h3>
          <p className="text-sm text-zinc-400">{t('settings.organization.description')}</p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
        <div className="space-y-2">
          <Label>{t('settings.organization.nameLabel')}</Label>
          <Input className="bg-zinc-950 border-zinc-800" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t('settings.organization.addressLabel')}</Label>
          <Textarea className="bg-zinc-950 border-zinc-800" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('settings.organization.phoneLabel')}</Label>
            <Input className="bg-zinc-950 border-zinc-800" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.organization.npwpLabel')}</Label>
            <Input className="bg-zinc-950 border-zinc-800" value={form.npwp} onChange={(e) => setForm({ ...form, npwp: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t('settings.organization.logoUrlLabel')}</Label>
          <Input className="bg-zinc-950 border-zinc-800" placeholder="https://..." value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
          <p className="text-xs text-zinc-500">{t('settings.organization.logoUrlHint')}</p>
        </div>
        <div className="pt-2 flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
