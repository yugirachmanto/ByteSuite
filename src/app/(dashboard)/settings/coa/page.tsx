'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface CoaAccount {
  id: string
  code: string
  name: string
  type: string
  is_active: boolean
}

const typeColors: Record<string, string> = {
  asset: 'bg-blue-950/20 text-blue-400 border-blue-900/50',
  liability: 'bg-amber-950/20 text-amber-400 border-amber-900/50',
  equity: 'bg-purple-950/20 text-purple-400 border-purple-900/50',
  income: 'bg-emerald-950/20 text-emerald-400 border-emerald-900/50',
  expense: 'bg-red-950/20 text-red-400 border-red-900/50',
}

export default function CoaSettingsPage() {
  const supabase = createClient()
  const [accounts, setAccounts] = useState<CoaAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newAccount, setNewAccount] = useState({ code: '', name: '', type: 'asset' })

  useEffect(() => {
    fetchAccounts()
  }, [])

  async function fetchAccounts() {
    setLoading(true)
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .order('code')
    setAccounts(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!newAccount.code.trim() || !newAccount.name.trim()) {
      toast.error('Code and name are required')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user?.id)
        .single()

      const { error } = await supabase.from('chart_of_accounts').insert({
        org_id: profile?.org_id,
        code: newAccount.code,
        name: newAccount.name,
        type: newAccount.type,
        is_active: true,
      })
      if (error) throw error
      toast.success('Account added')
      setDialogOpen(false)
      setNewAccount({ code: '', name: '', type: 'asset' })
      fetchAccounts()
    } catch (error: any) {
      toast.error(error.message || 'Failed to add account')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(id: string, current: boolean) {
    const { error } = await supabase
      .from('chart_of_accounts')
      .update({ is_active: !current })
      .eq('id', id)
    if (error) {
      toast.error('Failed to update')
    } else {
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_active: !current } : a))
      )
    }
  }

  // Group by type
  const grouped = ['asset', 'liability', 'equity', 'income', 'expense'].map((type) => ({
    type,
    label: type.charAt(0).toUpperCase() + type.slice(1),
    accounts: accounts.filter((a) => a.type === type),
  }))

  return (
    <>
      <div className="flex justify-end">
        <Button
          className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2 opacity-30" />
            Loading accounts...
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.type} className="rounded-md border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
                <Badge variant="outline" className={typeColors[group.type]}>
                  {group.label}
                </Badge>
                <span className="text-xs text-zinc-500">{group.accounts.length} accounts</span>
              </div>
              {group.accounts.length === 0 ? (
                <div className="p-4 text-center text-zinc-500 text-sm">
                  No {group.label.toLowerCase()} accounts
                </div>
              ) : (
                <Table>
                  <TableBody>
                    {group.accounts.map((account) => (
                      <TableRow key={account.id} className="border-zinc-800 hover:bg-zinc-800/20">
                        <TableCell className="font-mono text-xs text-zinc-500 w-28">
                          {account.code}
                        </TableCell>
                        <TableCell className="font-medium text-zinc-100">
                          {account.name}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={account.is_active ? 'text-emerald-500 text-xs' : 'text-zinc-500 text-xs'}
                            onClick={() => toggleActive(account.id, account.is_active)}
                          >
                            {account.is_active ? 'Active' : 'Inactive'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Account Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Account Code</Label>
              <Input
                className="bg-zinc-950 border-zinc-800"
                placeholder="e.g. 1-1-006"
                value={newAccount.code}
                onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input
                className="bg-zinc-950 border-zinc-800"
                placeholder="e.g. Persediaan Packaging"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={newAccount.type}
                onValueChange={(v) => setNewAccount({ ...newAccount, type: v as string })}
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="liability">Liability</SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-800" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handleAdd} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
