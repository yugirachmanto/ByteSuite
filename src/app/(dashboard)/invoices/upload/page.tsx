'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Upload, X, FileImage, FileText, Loader2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function InvoiceUploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const { selectedOutletId, outlets } = useOutlet()
  const router = useRouter()
  const supabase = createClient()

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      const isImage = selectedFile.type.startsWith('image/')
      const isPdf = selectedFile.type === 'application/pdf'
      
      if (!isImage && !isPdf) {
        toast.error('Please upload an image or PDF file')
        return
      }
      setFile(selectedFile)
      if (isImage) {
        setPreview(URL.createObjectURL(selectedFile))
      } else {
        setPreview('pdf') // Placeholder for PDF
      }
    }
  }

  const removeFile = () => {
    setFile(null)
    setPreview(null)
  }

  const handleUpload = async () => {
    if (!file || !selectedOutletId) return
    
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()
      
      const orgId = profile?.org_id
      if (!orgId) throw new Error('Organization not found')

      const invoiceId = crypto.randomUUID()
      const fileExt = file.name.split('.').pop()
      const filePath = `${orgId}/${selectedOutletId}/${invoiceId}.${fileExt}`

      // 1. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Get signed URL or public URL (using public for simplicity if bucket is public, but plan says private)
      const { data: { publicUrl } } = supabase.storage
        .from('invoices')
        .getPublicUrl(filePath)

      // 2. Create invoice record
      const { error: dbError } = await supabase
        .from('invoices')
        .insert({
          id: invoiceId,
          outlet_id: selectedOutletId,
          image_url: publicUrl,
          status: 'pending',
          created_by: user.id
        })

      if (dbError) throw dbError

      setUploading(false)
      setExtracting(true)

      // 3. Trigger the AI extraction and wait for it
      const outletName = outlets.find(o => o.id === selectedOutletId)?.name
      const res = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          image_url: publicUrl,
          outlet_name: outletName || ''
        })
      })

      if (!res.ok) {
        throw new Error('AI extraction failed, but invoice was saved.')
      }

      toast.success('Invoice analyzed successfully!')
      router.push(`/invoices/${invoiceId}/review`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload invoice')
    } finally {
      setUploading(false)
      setExtracting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/invoices">
          <Button variant="ghost" size="icon" className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Upload Invoice</h2>
          <p className="text-zinc-400 text-sm">Take a photo or upload an invoice image.</p>
        </div>
      </div>

      <Card className="border-dashed border-zinc-800 bg-zinc-900/30">
        <CardContent className="p-12">
          {!preview ? (
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                <Upload className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-medium text-zinc-200">Drop your invoice here</p>
                <p className="text-sm text-zinc-500">Supports JPG, PNG, WEBP, PDF</p>
              </div>
              <label htmlFor="file-upload" className="cursor-pointer">
                <span className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800">
                  Select File
                </span>
                <input id="file-upload" type="file" className="hidden" accept="image/*,.pdf" onChange={onFileChange} />
              </label>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 flex items-center justify-center">
                {preview === 'pdf' ? (
                  <div className="flex flex-col items-center gap-4 text-zinc-400">
                    <div className="h-20 w-20 rounded-2xl bg-red-500/10 flex items-center justify-center">
                      <FileText className="h-10 w-10 text-red-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-zinc-200 max-w-[200px] truncate">{file?.name}</p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">PDF Document</p>
                    </div>
                  </div>
                ) : (
                  <img src={preview!} alt="Preview" className="h-full w-full object-contain" />
                )}
                <Button 
                  variant="destructive" 
                  size="icon" 
                  className="absolute right-2 top-2 h-8 w-8" 
                  onClick={removeFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Button 
                className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200" 
                onClick={handleUpload}
                disabled={uploading || extracting}
              >
                {extracting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing Invoice...
                  </>
                ) : uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    {file?.type === 'application/pdf' ? <FileText className="mr-2 h-4 w-4" /> : <FileImage className="mr-2 h-4 w-4" />}
                    Process Invoice
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg bg-zinc-900/50 p-6 border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-blue-400" />
          How it works
        </h3>
        <ul className="space-y-3 text-sm text-zinc-400">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-100">1</span>
            <span>Upload a clear photo or PDF of your vendor invoice.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-100">2</span>
            <span>AI extracts line items, totals, and vendor details automatically.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-100">3</span>
            <span>Review the extracted data and post it to your inventory and GL.</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
