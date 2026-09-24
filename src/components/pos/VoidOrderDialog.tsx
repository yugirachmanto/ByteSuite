'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface VoidOrderDialogProps {
  orderId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onVoided: () => void
}

/** Confirms and performs a full-order void (same-day only; enforced server-side). */
export function VoidOrderDialog({ orderId, open, onOpenChange, onVoided }: VoidOrderDialogProps) {
  const [reason, setReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  useEffect(() => { if (open) setReason('') }, [open])

  const handleVoid = async () => {
    if (!orderId || !reason.trim()) return
    setVoiding(true)
    try {
      const res = await fetch('/api/pos/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal membatalkan transaksi')
      toast.success('Transaksi dibatalkan (void)')
      onOpenChange(false)
      onVoided()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setVoiding(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
        <AlertDialogHeader>
          <AlertDialogTitle>Batalkan (void) transaksi ini?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Stok dikembalikan dan jurnal GL transaksi ini dihapus. Hanya bisa untuk transaksi hari ini dan tidak bisa dibatalkan lagi.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <label className="text-xs text-zinc-500 font-medium uppercase">Alasan (wajib)</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="mis. Salah input item oleh kasir"
            className="bg-zinc-950 border-zinc-800"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">Batal</AlertDialogCancel>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleVoid}
            disabled={voiding || !reason.trim()}
          >
            {voiding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Void Transaksi
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
