'use client'

import { useEffect, useRef, useState, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { ShiftReportLayout, type ShiftReportShift, type ShiftReportOrg, type ShiftReportOutlet } from '@/components/pos/ShiftReportLayout'
import { fetchPosSalesSummary, type PosSalesSummary } from '@/lib/pos/salesSummary'

export default function ShiftReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = use(params)
  const supabase = createClient()

  const [shift, setShift] = useState<ShiftReportShift | null>(null)
  const [isFinal, setIsFinal] = useState(false)
  const [summary, setSummary] = useState<PosSalesSummary | null>(null)
  const [org, setOrg] = useState<ShiftReportOrg | null>(null)
  const [outlet, setOutlet] = useState<ShiftReportOutlet | null>(null)
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('58mm')
  const [loading, setLoading] = useState(true)
  const hasAutoPrinted = useRef(false)

  const fetchReport = async () => {
    setLoading(true)
    const { data: shiftData } = await supabase
      .from('pos_shifts')
      .select('id, status, org_id, outlet_id, cashier_id, opened_at, closed_at, opening_float, closing_counted, expected_cash, variance')
      .eq('id', shiftId)
      .single()

    if (!shiftData) { setLoading(false); return }

    const [cashierRes, orgRes, outletRes, summaryData] = await Promise.all([
      shiftData.cashier_id
        ? supabase.from('user_profiles').select('full_name').eq('id', shiftData.cashier_id).single()
        : Promise.resolve({ data: null }),
      supabase.from('organizations').select('name, address, receipt_paper_width').eq('id', shiftData.org_id).single(),
      supabase.from('outlets').select('name, address').eq('id', shiftData.outlet_id).single(),
      fetchPosSalesSummary(supabase, { outletId: shiftData.outlet_id, shiftId })
    ])

    setShift({
      id: shiftData.id,
      cashier_name: cashierRes.data?.full_name || null,
      opened_at: shiftData.opened_at,
      closed_at: shiftData.closed_at,
      opening_float: shiftData.opening_float,
      closing_counted: shiftData.closing_counted,
      expected_cash: shiftData.expected_cash,
      variance: shiftData.variance,
    })
    setIsFinal(shiftData.status === 'closed')
    setSummary(summaryData)
    if (orgRes.data) {
      setOrg(orgRes.data)
      setPaperWidth((orgRes.data.receipt_paper_width as '58mm' | '80mm') || '58mm')
    }
    setOutlet(outletRes.data)
    setLoading(false)
  }

  useEffect(() => { fetchReport() }, [shiftId])

  useEffect(() => {
    if (loading || hasAutoPrinted.current || !shift || !isFinal) return
    hasAutoPrinted.current = true
    const timer = setTimeout(() => window.print(), 400)
    return () => clearTimeout(timer)
  }, [loading, shift, isFinal])

  if (loading) {
    return <div className="py-20 text-center text-zinc-500 text-sm">Loading shift report...</div>
  }

  if (!shift || !org || !outlet || !summary) {
    return (
      <div className="py-20 text-center space-y-4">
        <p className="text-zinc-400">Shift report not found.</p>
        <Link href="/pos"><Button variant="outline" className="border-zinc-800 text-zinc-300">Back to POS</Button></Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
      <div className="mx-auto max-w-sm mb-6 flex items-center justify-between print:hidden">
        <Link href="/pos">
          <Button variant="ghost" className="text-zinc-400 hover:text-zinc-100">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to POS
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Select value={paperWidth} onValueChange={(val: any) => val && setPaperWidth(val)}>
            <SelectTrigger className="w-24 bg-zinc-900 border-zinc-800 text-zinc-100 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="58mm">58mm</SelectItem>
              <SelectItem value="80mm">80mm</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => window.print()} className="bg-indigo-600 text-white hover:bg-indigo-700">
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {!isFinal && (
        <div className="mx-auto max-w-sm mb-4 print:hidden rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-sm text-amber-300">
          This is a live preview (X-Report) of a shift still in progress — it will not auto-print and can be reopened anytime.
        </div>
      )}

      <div className="mx-auto max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg p-4 print:p-0 print:border-0 print:bg-transparent print:shadow-none">
        <ShiftReportLayout shift={shift} summary={summary} org={org} outlet={outlet} paperWidth={paperWidth} isFinal={isFinal} />
      </div>
    </div>
  )
}
