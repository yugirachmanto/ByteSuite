'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import {
  Upload, X, FileImage, FileText, Loader2,
  ArrowLeft, Sparkles, Brain, CheckCircle2, Cpu
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

// ── AI Overlay ────────────────────────────────────────────────────────────────
function AIOverlay({ stage }: { stage: 'uploading' | 'extracting' }) {
  const steps = [
    { label: 'Uploading to storage',  done: stage === 'extracting' },
    { label: 'Reading document',      done: false, active: stage === 'extracting' },
    { label: 'Extracting line items', done: false, active: stage === 'extracting' },
    { label: 'Structuring data',      done: false, active: stage === 'extracting' },
  ]
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 rounded-xl bg-zinc-950/85 backdrop-blur-sm">
      {/* Pulsing orb */}
      <div className="relative flex items-center justify-center">
        <span className="absolute h-20 w-20 animate-ping rounded-full bg-violet-500/20" style={{ animationDuration: '1.2s' }} />
        <span className="absolute h-14 w-14 animate-ping rounded-full bg-blue-500/20" style={{ animationDuration: '1.6s', animationDelay: '0.2s' }} />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-violet-500 to-cyan-400 shadow-xl shadow-violet-500/30">
          <Brain className="h-6 w-6 text-white" />
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-zinc-100">
          {stage === 'uploading' ? 'Uploading…' : 'AI Analyzing Invoice'}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {stage === 'uploading' ? 'Sending to secure storage' : 'Usually 5–15 seconds'}
        </p>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-2 w-48">
        {steps.map((step, i) => {
          const isActive = step.active || (stage === 'uploading' && i === 0)
          return (
            <div key={i} className="flex items-center gap-2.5">
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] transition-all
                ${step.done ? 'bg-emerald-500/20 text-emerald-400'
                  : isActive ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-zinc-800 text-zinc-600'}`}
              >
                {step.done ? <CheckCircle2 className="h-3 w-3" />
                  : isActive ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <span className="font-bold">{i + 1}</span>}
              </div>
              <span className={`text-xs transition-colors
                ${step.done ? 'text-emerald-400 line-through'
                  : isActive ? 'text-zinc-200'
                  : 'text-zinc-600'}`}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Scanning bar */}
      {stage === 'extracting' && (
        <div className="h-0.5 w-48 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full w-1/3 animate-[scanner_1.8s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InvoiceUploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)

  const { selectedOutletId, outlets } = useOutlet()
  const router = useRouter()
  const supabase = createClient()
  const isProcessing = uploading || extracting

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
      toast.error('Please upload an image or PDF file')
      return
    }
    setFile(f)
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : 'pdf')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const removeFile = () => { setFile(null); setPreview(null) }

  const handleUpload = async () => {
    if (!file || !selectedOutletId) return
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: profile } = await supabase
        .from('user_profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) throw new Error('Organization not found')

      const invoiceId = crypto.randomUUID()
      const ext = file.name.split('.').pop()
      const filePath = `${profile.org_id}/${selectedOutletId}/${invoiceId}.${ext}`

      const { error: upErr } = await supabase.storage.from('invoices').upload(filePath, file)
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('invoices').getPublicUrl(filePath)

      const { error: dbErr } = await supabase.from('invoices').insert({
        id: invoiceId, outlet_id: selectedOutletId,
        image_url: publicUrl, status: 'pending', created_by: user.id
      })
      if (dbErr) throw dbErr

      setUploading(false)
      setExtracting(true)

      const outletName = outlets.find(o => o.id === selectedOutletId)?.name || ''
      const res = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, image_url: publicUrl, outlet_name: outletName })
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // API key not configured — guide user to settings
        if (res.status === 402 && body.setup_required) {
          toast.error('OpenAI API key required. Redirecting to Integrations…', { duration: 4000 })
          setTimeout(() => router.push('/integrations'), 1500)
          return
        }
        throw new Error(body.error || 'AI extraction failed, but invoice was saved.')
      }

      toast.success('Invoice analyzed successfully!')
      router.push(`/invoices/${invoiceId}/review`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload invoice')
    } finally {
      setUploading(false)
      setExtracting(false)
    }
  }

  const outletName = outlets.find(o => o.id === selectedOutletId)?.name

  return (
    /*
     * We use -m-8 to cancel the parent's p-8 padding, then restore it only where
     * needed — this lets us go edge-to-edge and be truly full-height without scroll.
     */
    <div className="-m-8 flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-zinc-950">

      {/* ── Top bar ── */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800/60 px-6">
        <Link href="/invoices">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-zinc-100">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="h-4 w-px bg-zinc-800" />
        <div>
          <span className="text-sm font-semibold text-zinc-100">Upload Invoice</span>
          <span className="ml-2 text-xs text-zinc-500">AI will extract line items automatically</span>
        </div>
        {outletName && (
          <span className="ml-auto rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300">
            {outletName}
          </span>
        )}
      </div>

      {/* ── Body: two columns ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — upload / preview */}
        <div className="relative flex flex-1 flex-col overflow-hidden border-r border-zinc-800/60">
          {!preview ? (
            /* Drop zone */
            <label
              htmlFor="file-upload"
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex h-full cursor-pointer flex-col items-center justify-center gap-4 transition-colors duration-200
                ${dragging ? 'bg-blue-500/5' : 'bg-zinc-950'}`}
            >
              {/* Dashed border inset */}
              <div className={`absolute inset-4 rounded-2xl border-2 border-dashed transition-colors duration-200
                ${dragging ? 'border-blue-500' : 'border-zinc-800 hover:border-zinc-600'}`}
              />

              {/* Content */}
              <div className="relative flex flex-col items-center gap-4 text-center">
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-200
                  ${dragging ? 'bg-blue-500/15 text-blue-400 scale-110' : 'bg-zinc-900 text-zinc-500'}`}
                >
                  <Upload className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-base font-semibold text-zinc-200">
                    {dragging ? 'Drop to upload' : 'Drop invoice here'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">Supports JPG, PNG, WEBP, PDF · up to 10 MB</p>
                </div>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100">
                  Browse files
                </span>
              </div>
              <input id="file-upload" type="file" className="hidden" accept="image/*,.pdf"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </label>
          ) : (
            /* Preview */
            <div className="relative flex flex-1 overflow-hidden">
              {isProcessing && <AIOverlay stage={uploading ? 'uploading' : 'extracting'} />}

              {preview === 'pdf' ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
                    <FileText className="h-8 w-8 text-red-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-zinc-200 max-w-xs truncate">{file?.name}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-widest text-zinc-600 font-bold">PDF Document</p>
                  </div>
                </div>
              ) : (
                /* Image: fills container without driving its size */
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <img
                    src={preview}
                    alt="Invoice preview"
                    className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                  />
                </div>
              )}

              {!isProcessing && (
                <button
                  onClick={removeFile}
                  className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-zinc-400 shadow ring-1 ring-zinc-700 transition hover:bg-red-900/60 hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right — compact controls */}
        <div className="flex w-64 shrink-0 flex-col gap-3 overflow-hidden p-4">

          {/* File info */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">File</p>
            {file ? (
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                  {file.type === 'application/pdf'
                    ? <FileText className="h-4 w-4 text-red-400" />
                    : <FileImage className="h-4 w-4 text-blue-400" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-200">{file.name}</p>
                  <p className="text-[10px] text-zinc-600">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
            ) : (
              <p className="text-xs italic text-zinc-600">No file selected</p>
            )}
          </div>

          {/* How it works */}
          <div className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">How it works</p>
            <ol className="flex flex-col gap-3">
              {[
                'Upload a clear photo or PDF of your vendor invoice.',
                'AI reads and extracts vendors, totals, and line items.',
                'Review the data and post to inventory and ledger.',
              ].map((text, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-bold text-zinc-400">
                    {i + 1}
                  </span>
                  <span className="text-[11px] leading-relaxed text-zinc-500">{text}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Action button */}
          <Button
            className="h-10 w-full gap-2 bg-zinc-100 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-40"
            onClick={handleUpload}
            disabled={!file || isProcessing}
          >
            {extracting ? (
              <><Brain className="h-3.5 w-3.5 animate-pulse" />AI Analyzing…</>
            ) : uploading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" />Process Invoice</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
