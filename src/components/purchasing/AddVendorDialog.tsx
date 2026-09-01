'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface AddVendorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  onCreated: (vendor: any) => void
}

export function AddVendorDialog({ open, onOpenChange, orgId, onCreated }: AddVendorDialogProps) {
  const supabase = createClient()
  const { t } = useLanguage()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccountNo, setBankAccountNo] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')

  const reset = () => {
    setName('')
    setEmail('')
    setPhone('')
    setAddress('')
    setBankName('')
    setBankAccountNo('')
    setBankAccountName('')
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('purchasing.addVendorDialog.errNameRequired'))
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert({
          org_id: orgId,
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          bank_name: bankName.trim() || null,
          bank_account_no: bankAccountNo.trim() || null,
          bank_account_name: bankAccountName.trim() || null,
        })
        .select()
        .single()

      if (error) throw error

      toast.success(t('purchasing.addVendorDialog.successCreated', { name: data.name }))
      onCreated(data)
      reset()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || t('purchasing.addVendorDialog.errFailedCreate'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">{t('purchasing.addVendorDialog.title')}</DialogTitle>
          <DialogDescription className="text-zinc-400">{t('purchasing.addVendorDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium uppercase">{t('purchasing.addVendorDialog.vendorNameLabel')}</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
              placeholder={t('purchasing.addVendorDialog.vendorNamePlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">{t('purchasing.addVendorDialog.emailLabel')}</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                placeholder="email@vendor.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">{t('purchasing.addVendorDialog.phoneLabel')}</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                placeholder="0812xxxxxx"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium uppercase">{t('purchasing.addVendorDialog.addressLabel')}</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
              placeholder={t('purchasing.addVendorDialog.addressPlaceholder')}
            />
          </div>

          <div className="pt-3 border-t border-zinc-800 space-y-3">
            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">{t('purchasing.addVendorDialog.bankSectionTitle')}</span>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">{t('purchasing.addVendorDialog.bankNameLabel')}</label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                placeholder="e.g. BCA, Mandiri"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">{t('purchasing.addVendorDialog.accountNoLabel')}</label>
                <Input
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                  placeholder="xxxxxxxxxx"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">{t('purchasing.addVendorDialog.accountNameLabel')}</label>
                <Input
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                  placeholder="Beneficiary Name"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-800 bg-zinc-900 text-zinc-300">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('purchasing.addVendorDialog.saveButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
