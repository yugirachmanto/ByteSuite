'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Plus, Trash2, Save, ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NewJournalPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const router = useRouter()
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<any[]>([
    { id: crypto.randomUUID(), coa_id: '', debit: 0, credit: 0 },
    { id: crypto.randomUUID(), coa_id: '', debit: 0, credit: 0 }
  ])
  
  const [accounts, setAccounts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchAccounts() {
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code')
      setAccounts(data || [])
    }
    fetchAccounts()
  }, [supabase])

  const addLine = () => {
    setLines([...lines, { id: crypto.randomUUID(), coa_id: '', debit: 0, credit: 0 }])
  }

  const removeLine = (id: string) => {
    if (lines.length <= 2) return
    setLines(lines.filter(l => l.id !== id))
  }

  const updateLine = (id: string, field: string, value: any) => {
    setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0)
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0)
  const isBalanced = totalDebit === totalCredit && totalDebit > 0

  const handleSave = async () => {
    if (!isBalanced) {
      toast.error('Journal must be balanced (Debit = Credit)')
      return
    }
    if (!description) {
      toast.error('Description is required')
      return
    }
    if (!selectedOutletId) {
      toast.error('No outlet selected. Please check your outlet context.')
      return
    }
    const missingCoa = lines.find(l => !l.coa_id || l.coa_id === '')
    if (missingCoa) {
      toast.error('Please select an account for all lines.')
      return
    }

    setSaving(true)
    try {
      const journalId = crypto.randomUUID()
      const entriesToInsert = lines.map(line => ({
        outlet_id: selectedOutletId,
        entry_date: date,
        coa_id: line.coa_id,
        debit: parseFloat(line.debit) || 0,
        credit: parseFloat(line.credit) || 0,
        description: description,
        reference_id: journalId,
        reference_type: 'manual_journal'
      }))

      const { error } = await supabase.from('gl_entries').insert(entriesToInsert)
      if (error) {
        console.error('Insert error:', error)
        throw error
      }

      toast.success('Journal entry recorded successfully!')
      router.push('/accounting/journal')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save journal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/accounting/journal">
            <Button variant="ghost" size="icon" className="text-zinc-400">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">New Journal Entry</h2>
            <p className="text-zinc-400 text-sm">Manually record a financial transaction.</p>
          </div>
        </div>
        <Button 
          className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          disabled={!isBalanced || saving}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Post Journal
        </Button>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">Transaction Date</label>
              <Input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">Description / Memo</label>
              <Input 
                placeholder="e.g. Monthly Rent Adjustment" 
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          <Table>
            <TableHeader className="border-zinc-800">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-zinc-400">Account</TableHead>
                <TableHead className="text-zinc-400 text-right w-[150px]">Debit</TableHead>
                <TableHead className="text-zinc-400 text-right w-[150px]">Credit</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id} className="border-zinc-800 hover:bg-zinc-800/20">
                  <TableCell>
                    <select
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-700"
                      value={line.coa_id}
                      onChange={e => updateLine(line.id, 'coa_id', e.target.value)}
                    >
                      <option value="">Select Account...</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number"
                      placeholder="0.00"
                      value={line.debit || ''}
                      onChange={e => updateLine(line.id, 'debit', e.target.value)}
                      className="text-right bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number"
                      placeholder="0.00"
                      value={line.credit || ''}
                      onChange={e => updateLine(line.id, 'credit', e.target.value)}
                      className="text-right bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                    />
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-zinc-600 hover:text-red-400"
                      onClick={() => removeLine(line.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex justify-between items-center mt-6 py-4 border-t border-zinc-800">
            <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400" onClick={addLine}>
              <Plus className="mr-2 h-4 w-4" />
              Add Line
            </Button>
            
            <div className="flex gap-12 pr-12">
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-zinc-500">Total Debit</p>
                <p className="text-xl font-bold font-mono text-zinc-100">{totalDebit.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-zinc-500">Total Credit</p>
                <p className="text-xl font-bold font-mono text-zinc-100">{totalCredit.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {!isBalanced && totalDebit > 0 && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-xs text-center font-medium">
              Journal is out of balance by {(totalDebit - totalCredit).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
