'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  ReceiptLayout,
  DEFAULT_RECEIPT_FOOTER,
  type ReceiptLine,
  type ReceiptOrderData,
  type ReceiptOrg,
  type ReceiptOutlet,
  type ReceiptPayment,
} from '@/components/pos/ReceiptLayout'
import { uploadReceiptImage } from '@/lib/pos/receiptImageUpload'
import { getCurrentUserRole, canAccess } from '@/lib/auth/canAccess'

const EDIT_ROLES = ['owner', 'admin']

const SAMPLE_ORDER: ReceiptOrderData = {
  id: 'a1b2c3d4-0000-0000-0000-000000000000',
  created_at: new Date().toISOString(),
  payment_method: 'Cash',
  subtotal: 45000,
  tax_amount: 0,
  total_amount: 45000,
  discount_amount: 0,
  cashier_name: 'Kasir',
}
const SAMPLE_LINES: ReceiptLine[] = [
  { id: '1', name: 'Kopi Susu', qty: 2, unit_price: 18000, subtotal: 36000, discount_amount: 0 },
  { id: '2', name: 'Roti Bakar', qty: 1, unit_price: 9000, subtotal: 9000, discount_amount: 0 },
]
const SAMPLE_PAYMENTS: ReceiptPayment[] = [
  { id: '1', payment_method: 'Cash', amount: 45000, cash_received: 50000, change_due: 5000, notes: null },
]

interface DesignState {
  receipt_logo_url: string | null
  receipt_header_text: string
  receipt_footer_text: string
  receipt_footer_image_url: string | null
  receipt_show_org_name: boolean
  receipt_show_address: boolean
  receipt_show_npwp: boolean
  receipt_show_outlet_name: boolean
}

export default function ReceiptDesignPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'logo' | 'footer' | null>(null)
  const [orgId, setOrgId] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [baseOrg, setBaseOrg] = useState<ReceiptOrg | null>(null)
  const [outlet, setOutlet] = useState<ReceiptOutlet>({ name: 'Nama Outlet', address: null })
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('58mm')
  const [design, setDesign] = useState<DesignState>({
    receipt_logo_url: null,
    receipt_header_text: '',
    receipt_footer_text: '',
    receipt_footer_image_url: null,
    receipt_show_org_name: true,
    receipt_show_address: true,
    receipt_show_npwp: true,
    receipt_show_outlet_name: true,
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: profile }, role] = await Promise.all([
        supabase.from('user_profiles').select('org_id').eq('id', user.id).single(),
        getCurrentUserRole(supabase),
      ])
      setCanEdit(canAccess(role, EDIT_ROLES))
      if (!profile?.org_id) { setLoading(false); return }
      setOrgId(profile.org_id)

      const [orgRes, outletRes] = await Promise.all([
        supabase
          .from('organizations')
          .select('name, address, npwp, receipt_paper_width, qris_image_url, bank_name, bank_account_number, bank_account_holder, receipt_logo_url, receipt_header_text, receipt_footer_text, receipt_footer_image_url, receipt_show_org_name, receipt_show_address, receipt_show_npwp, receipt_show_outlet_name')
          .eq('id', profile.org_id)
          .single(),
        supabase.from('outlets').select('name, address').eq('org_id', profile.org_id).limit(1).maybeSingle(),
      ])
      const o = orgRes.data as any
      if (o) {
        setBaseOrg(o)
        setPaperWidth((o.receipt_paper_width as '58mm' | '80mm') || '58mm')
        setDesign({
          receipt_logo_url: o.receipt_logo_url ?? null,
          receipt_header_text: o.receipt_header_text ?? '',
          receipt_footer_text: o.receipt_footer_text ?? '',
          receipt_footer_image_url: o.receipt_footer_image_url ?? null,
          receipt_show_org_name: o.receipt_show_org_name ?? true,
          receipt_show_address: o.receipt_show_address ?? true,
          receipt_show_npwp: o.receipt_show_npwp ?? true,
          receipt_show_outlet_name: o.receipt_show_outlet_name ?? true,
        })
      }
      if (outletRes.data) setOutlet(outletRes.data)
      setLoading(false)
    }
    load()
  }, [supabase])

  const update = <K extends keyof DesignState>(key: K, value: DesignState[K]) =>
    setDesign((d) => ({ ...d, [key]: value }))

  const handleUpload = async (kind: 'logo' | 'footer', file: File | undefined) => {
    if (!file || !orgId) return
    setUploading(kind)
    try {
      const url = await uploadReceiptImage(supabase, orgId, file, kind)
      update(kind === 'logo' ? 'receipt_logo_url' : 'receipt_footer_image_url', url)
      toast.success('Image uploaded. Click Save to apply it to receipts.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload image')
    } finally {
      setUploading(null)
    }
  }

  const handleSave = async () => {
    if (!orgId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          receipt_logo_url: design.receipt_logo_url,
          receipt_header_text: design.receipt_header_text.trim() || null,
          receipt_footer_text: design.receipt_footer_text.trim() || null,
          receipt_footer_image_url: design.receipt_footer_image_url,
          receipt_show_org_name: design.receipt_show_org_name,
          receipt_show_address: design.receipt_show_address,
          receipt_show_npwp: design.receipt_show_npwp,
          receipt_show_outlet_name: design.receipt_show_outlet_name,
        })
        .eq('id', orgId)
      if (error) throw error
      toast.success('Receipt design saved. It will appear on new receipts.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save receipt design')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <Skeleton className="h-96 w-full bg-zinc-900" />
        <Skeleton className="h-96 w-64 bg-zinc-900" />
      </div>
    )
  }

  if (!baseOrg) {
    return <p className="text-sm text-zinc-500">Organization not found.</p>
  }

  const previewOrg: ReceiptOrg = {
    ...baseOrg,
    ...design,
    receipt_header_text: design.receipt_header_text,
    receipt_footer_text: design.receipt_footer_text,
  }

  const toggles: { key: keyof DesignState; label: string }[] = [
    { key: 'receipt_show_org_name', label: 'Nama bisnis' },
    { key: 'receipt_show_address', label: 'Alamat' },
    { key: 'receipt_show_npwp', label: 'NPWP' },
    { key: 'receipt_show_outlet_name', label: 'Nama outlet' },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto] items-start">
      <div className="space-y-6">
        {!canEdit && (
          <p className="text-sm text-amber-400">Hanya owner dan admin yang dapat mengubah desain struk.</p>
        )}

        <ImageField
          label="Logo"
          hint="Tampil di bagian paling atas struk. Otomatis diubah ke hitam-putih agar tajam di printer thermal."
          url={design.receipt_logo_url}
          uploading={uploading === 'logo'}
          disabled={!canEdit}
          onFile={(f) => handleUpload('logo', f)}
          onRemove={() => update('receipt_logo_url', null)}
        />

        <div className="space-y-2">
          <Label className="text-zinc-200">Header</Label>
          <p className="text-xs text-zinc-500">Tampilkan atau sembunyikan baris bawaan, lalu tambahkan teks bebas di bawahnya (mis. jam buka, Instagram).</p>
          <div className="grid grid-cols-2 gap-2">
            {toggles.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
                {label}
                <Switch
                  checked={design[key] as boolean}
                  disabled={!canEdit}
                  onCheckedChange={(v) => update(key, v as never)}
                />
              </label>
            ))}
          </div>
          <Textarea
            value={design.receipt_header_text}
            onChange={(e) => update('receipt_header_text', e.target.value)}
            placeholder={'Buka setiap hari 08.00 - 22.00\nIG: @namabisnis'}
            rows={3}
            disabled={!canEdit}
            className="bg-zinc-950 border-zinc-800"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-zinc-200">Footer</Label>
          <Textarea
            value={design.receipt_footer_text}
            onChange={(e) => update('receipt_footer_text', e.target.value)}
            placeholder={DEFAULT_RECEIPT_FOOTER}
            rows={3}
            disabled={!canEdit}
            className="bg-zinc-950 border-zinc-800"
          />
          <p className="text-xs text-zinc-500">Kosongkan untuk memakai teks bawaan.</p>
        </div>

        <ImageField
          label="Gambar footer"
          hint="Mis. QR Instagram, promo, atau tanda tangan. Tampil di atas teks footer."
          url={design.receipt_footer_image_url}
          uploading={uploading === 'footer'}
          disabled={!canEdit}
          onFile={(f) => handleUpload('footer', f)}
          onRemove={() => update('receipt_footer_image_url', null)}
        />

        <Button
          onClick={handleSave}
          disabled={saving || !canEdit}
          className="bg-indigo-600 text-white hover:bg-indigo-700"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>

      <div className="lg:sticky lg:top-4">
        <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Preview ({paperWidth})</p>
        <div className="flex justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <ReceiptLayout
            order={SAMPLE_ORDER}
            lines={SAMPLE_LINES}
            payments={SAMPLE_PAYMENTS}
            org={previewOrg}
            outlet={outlet}
            paperWidth={paperWidth}
          />
        </div>
      </div>
    </div>
  )
}

function ImageField({ label, hint, url, uploading, disabled, onFile, onRemove }: {
  label: string
  hint: string
  url: string | null
  uploading: boolean
  disabled: boolean
  onFile: (file: File | undefined) => void
  onRemove: () => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-zinc-200">{label}</Label>
      <p className="text-xs text-zinc-500">{hint}</p>
      {url && (
        <div className="relative w-fit rounded-lg bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="h-16 w-auto max-w-[200px] object-contain" />
          {!disabled && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${label}`}
              className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <label className={`flex w-fit items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 transition-colors ${disabled ? 'opacity-50' : 'cursor-pointer hover:border-zinc-600'}`}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : <Upload className="h-4 w-4 text-zinc-400" />}
        <span className="text-sm text-zinc-300">{url ? 'Ganti gambar' : 'Upload gambar'}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
