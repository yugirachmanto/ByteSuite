'use client'

import { useState, useEffect, useRef } from 'react'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Plus, Loader2, Download, Upload, Pencil, Trash2 } from 'lucide-react'
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<CoaAccount | null>(null)
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [accountToDelete, setAccountToDelete] = useState<CoaAccount | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,code,name,type\n1-1-001,Kas Kecil,asset\n2-1-001,Hutang Dagang,liability\n3-1-001,Modal,equity\n4-1-001,Pendapatan,income\n5-1-001,Beban Operasional,expense"
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "coa_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const csv = event.target?.result as string
        const lines = csv.split('\n')
        if (lines.length < 2) throw new Error('Empty CSV')

        const { data: { user } } = await supabase.auth.getUser()
        const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user?.id).single()

        const toInsert = []
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          const parts = line.split(',')
          const code = parts[0]
          const type = parts.pop()
          const name = parts.slice(1).join(',')
          if (code && name && type) {
            toInsert.push({
              org_id: profile?.org_id,
              code: code.trim(),
              name: name.trim().replace(/^"|"$/g, ''),
              type: type.trim().toLowerCase(),
              is_active: true
            })
          }
        }

        if (toInsert.length > 0) {
          const { error } = await supabase.from('chart_of_accounts').insert(toInsert)
          if (error) throw error
          
          // Re-calculate the hierarchy parents, is_header flags, and levels recursively
          await supabase.rpc('repair_coa_hierarchy', { p_org_id: profile?.org_id })

          toast.success(`Imported ${toInsert.length} accounts`)
          fetchAccounts()
        } else {
          toast.error('No valid data found in CSV')
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to import CSV')
      } finally {
        setLoading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

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

      // Re-calculate the hierarchy parents, is_header flags, and levels recursively
      await supabase.rpc('repair_coa_hierarchy', { p_org_id: profile?.org_id })

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

  const handleStartEdit = (account: CoaAccount) => {
    setEditingAccount({ ...account })
    setEditDialogOpen(true)
  }

  async function handleSaveEdit() {
    if (!editingAccount) return
    if (!editingAccount.code.trim() || !editingAccount.name.trim()) {
      toast.error('Code and name are required')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('chart_of_accounts')
        .update({
          code: editingAccount.code,
          name: editingAccount.name,
          type: editingAccount.type,
          is_active: editingAccount.is_active,
        })
        .eq('id', editingAccount.id)
      
      if (error) throw error

      // Get profile for org_id fallback
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user?.id).single()

      // Re-calculate the hierarchy parents, is_header flags, and levels recursively
      await supabase.rpc('repair_coa_hierarchy', { p_org_id: profile?.org_id })

      toast.success('Account updated successfully')
      setEditDialogOpen(false)
      setEditingAccount(null)
      fetchAccounts()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update account')
    } finally {
      setSaving(false)
    }
  }

  const handleStartDelete = (account: CoaAccount) => {
    setAccountToDelete(account)
    setDeleteDialogOpen(true)
  }

  async function handleConfirmDelete() {
    if (!accountToDelete) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('chart_of_accounts')
        .delete()
        .eq('id', accountToDelete.id)
      
      if (error) {
        if (error.code === '23503') {
          throw new Error('This account cannot be deleted because it is currently referenced by other records (e.g. items, GL entries, invoices).')
        }
        throw error
      }
      
      // Get profile for org_id fallback
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user?.id).single()

      // Re-calculate the hierarchy parents, is_header flags, and levels recursively
      await supabase.rpc('repair_coa_hierarchy', { p_org_id: profile?.org_id })

      toast.success('Account deleted successfully')
      setDeleteDialogOpen(false)
      setAccountToDelete(null)
      fetchAccounts()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete account')
    } finally {
      setDeleting(false)
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
      <div className="flex justify-end gap-2">
        <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800" onClick={handleDownloadTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Template
        </Button>
        <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800" onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />
          Import CSV
        </Button>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".csv" 
          onChange={handleImportCSV} 
        />
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
                      <TableRow key={account.id} className="border-zinc-800 hover:bg-zinc-800/20 group">
                        <TableCell className="font-mono text-xs text-zinc-500 w-28">
                          {account.code}
                        </TableCell>
                        <TableCell className="font-medium text-zinc-100">
                          {account.name}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-3">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={account.is_active}
                                onCheckedChange={() => toggleActive(account.id, account.is_active)}
                              />
                              <span className={`text-xs font-semibold select-none w-14 text-left ${
                                account.is_active ? 'text-emerald-500' : 'text-zinc-500'
                              }`}>
                                {account.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-zinc-500 hover:text-zinc-100"
                                onClick={() => handleStartEdit(account)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-950/20"
                                onClick={() => handleStartDelete(account)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
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

      {/* Edit Account Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          {editingAccount && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Account Code</Label>
                <Input
                  className="bg-zinc-950 border-zinc-800 font-mono"
                  placeholder="e.g. 1-1-006"
                  value={editingAccount.code}
                  onChange={(e) => setEditingAccount({ ...editingAccount, code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Account Name</Label>
                <Input
                  className="bg-zinc-950 border-zinc-800"
                  placeholder="e.g. Persediaan Packaging"
                  value={editingAccount.name}
                  onChange={(e) => setEditingAccount({ ...editingAccount, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={editingAccount.type}
                  onValueChange={(v) => setEditingAccount({ ...editingAccount, type: v as string })}
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
              <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-950/30">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Account Status</Label>
                  <p className="text-xs text-zinc-500">Allow this account to be selected in new transactions.</p>
                </div>
                <Switch
                  checked={editingAccount.is_active}
                  onCheckedChange={(checked) => setEditingAccount({ ...editingAccount, is_active: checked })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-zinc-800" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handleSaveEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Alert Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">Delete Account</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete account{" "}
              <span className="font-mono text-zinc-200 font-bold">
                {accountToDelete?.code} - {accountToDelete?.name}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-800 text-zinc-300 hover:bg-zinc-800" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white font-semibold"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Account
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
