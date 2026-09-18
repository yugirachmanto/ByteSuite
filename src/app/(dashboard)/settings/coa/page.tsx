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
import Papa from 'papaparse'

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

const VALID_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const
type CoaType = typeof VALID_TYPES[number]

// Ordered so more specific keywords (e.g. "cost of goods") are checked before
// generic ones — first match wins. Covers common English/Indonesian COA
// template wording (ESB-style templates, local accounting terms, etc).
const TYPE_KEYWORDS: [RegExp, CoaType][] = [
  [/capital|equity|modal/i, 'equity'],
  [/liabilit|hutang|payable/i, 'liability'],
  [/cost of goods|\bcogs\b|cost of sales/i, 'expense'],
  [/revenue|income|pendapatan|penjualan|sales(?!\s*tax)/i, 'income'],
  [/expense|charge|cost|beban|biaya/i, 'expense'],
  [/asset|aktiva|aset/i, 'asset'],
]

/** Normalizes a free-text "type" value (from a CSV column) to a valid coa_type, or null if unrecognized. */
function normalizeTypeValue(raw: string): CoaType | null {
  const v = raw.trim().toLowerCase()
  if ((VALID_TYPES as readonly string[]).includes(v)) return v as CoaType
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(v)) return type
  }
  return null
}

/** Extracts numeric segments from a COA code, regardless of separator (dash, space, dot). e.g. "1 0 00 000" -> [1,0,0,0] */
function codeSegments(code: string): number[] {
  return (code.match(/\d+/g) || []).map((s) => parseInt(s, 10))
}

/**
 * Canonical form of a code for matching "is this the same account" across
 * imports that may format codes differently (dashes vs spaces, leading
 * zeros) — e.g. "1-0-00-000" and "1 0 00 000" both normalize to "1-0-0-0".
 * Re-importing the same CSV (or a re-export of it) should update existing
 * rows in place instead of creating duplicates.
 */
function normalizeCodeKey(code: string): string {
  return codeSegments(code).join('-')
}

interface CoaImportRow {
  code: string
  name: string
  explicitType: string | null // raw value from a "type" column, if present
}

interface ResolvedCoaRow {
  code: string
  name: string
  type: CoaType
}

/**
 * Resolves a `type` for every row. A row's own "type" column value wins when
 * it's recognizable; otherwise the type is inherited from its top-level class
 * header — the row whose code has only its first numeric segment non-zero
 * (e.g. "1 0 00 000" = class 1's header) — matched by keyword against that
 * header's name. Rows that can't be resolved either way are returned
 * separately so the caller can block the import with a clear message instead
 * of guessing at a financial account's type.
 */
function resolveCoaTypes(rows: CoaImportRow[]): { resolved: ResolvedCoaRow[]; unresolved: CoaImportRow[] } {
  const classHeaderType = new Map<number, CoaType>()

  for (const row of rows) {
    const segments = codeSegments(row.code)
    if (segments.length < 2) continue
    const isClassHeader = segments.slice(1).every((s) => s === 0)
    if (!isClassHeader) continue
    const detected = normalizeTypeValue(row.name)
    if (detected && !classHeaderType.has(segments[0])) {
      classHeaderType.set(segments[0], detected)
    }
  }

  const resolved: ResolvedCoaRow[] = []
  const unresolved: CoaImportRow[] = []

  for (const row of rows) {
    const override = row.explicitType ? normalizeTypeValue(row.explicitType) : null
    if (override) {
      resolved.push({ code: row.code, name: row.name, type: override })
      continue
    }
    const segments = codeSegments(row.code)
    const inherited = segments.length > 0 ? classHeaderType.get(segments[0]) : undefined
    if (inherited) {
      resolved.push({ code: row.code, name: row.name, type: inherited })
    } else {
      unresolved.push(row)
    }
  }

  return { resolved, unresolved }
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
    const csvContent = "data:text/csv;charset=utf-8,code,name\n1-0-000,ASSETS,\n1-1-001,Kas Kecil,\n2-0-000,LIABILITIES,\n2-1-001,Hutang Dagang,\n3-0-000,EQUITY,\n3-1-001,Modal,\n4-0-000,REVENUE,\n4-1-001,Pendapatan,\n5-0-000,EXPENSES,\n5-1-001,Beban Operasional,"
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

    try {
      const parseResult = await new Promise<Papa.ParseResult<any>>((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: resolve,
          error: reject,
        })
      })

      const rows: CoaImportRow[] = parseResult.data
        .map((row: any) => {
          const code = (row['code'] || row['Code'] || '').toString().trim()
          const name = (row['name'] || row['Name'] || '').toString().trim()
          const explicitTypeRaw = (row['type'] || row['Type'] || '').toString().trim()
          return { code, name, explicitType: explicitTypeRaw || null }
        })
        .filter((r) => r.code && r.name)

      if (rows.length === 0) throw new Error('No valid rows found in CSV (need at least "code" and "name" columns)')

      const { resolved, unresolved } = resolveCoaTypes(rows)

      if (unresolved.length > 0) {
        const sample = unresolved.slice(0, 5).map((r) => `${r.code} — ${r.name}`).join(', ')
        throw new Error(
          `Could not determine an account type for ${unresolved.length} row(s): ${sample}${unresolved.length > 5 ? ', ...' : ''}. ` +
          `Either add a top-level header row for that class (e.g. "1-0-000,ASSETS") with a name containing asset/liability/equity/income/expense, ` +
          `or add an explicit "type" column for these rows.`
        )
      }

      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user?.id).single()

      // Dedupe rows within the CSV itself (last occurrence wins) before
      // diffing against what's already in the DB — otherwise two rows that
      // normalize to the same code would both try to insert/update separately.
      const dedupedByCode = new Map<string, ResolvedCoaRow>()
      for (const r of resolved) dedupedByCode.set(normalizeCodeKey(r.code), r)

      const { data: existingAccounts } = await supabase
        .from('chart_of_accounts')
        .select('id, code, name, type')
        .eq('org_id', profile?.org_id)

      const existingByCode = new Map((existingAccounts || []).map((a) => [normalizeCodeKey(a.code), a]))

      const toInsert: { org_id: string | undefined; code: string; name: string; type: CoaType; is_active: boolean }[] = []
      const toUpdate: { id: string; name: string; type: CoaType }[] = []
      let unchanged = 0

      for (const [key, r] of dedupedByCode) {
        const existing = existingByCode.get(key)
        if (!existing) {
          toInsert.push({ org_id: profile?.org_id, code: r.code, name: r.name, type: r.type, is_active: true })
        } else if (existing.name !== r.name || existing.type !== r.type) {
          toUpdate.push({ id: existing.id, name: r.name, type: r.type })
        } else {
          unchanged++
        }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from('chart_of_accounts').insert(toInsert)
        if (error) throw error
      }

      if (toUpdate.length > 0) {
        // Plain PK-based upsert (no onConflict target needed — `id` is already the primary key).
        const { error } = await supabase.from('chart_of_accounts').upsert(toUpdate)
        if (error) throw error
      }

      // Re-calculate the hierarchy parents, is_header flags, and levels recursively
      await supabase.rpc('repair_coa_hierarchy', { p_org_id: profile?.org_id })

      toast.success(`${toInsert.length} baru, ${toUpdate.length} diupdate, ${unchanged} tidak berubah`)
      fetchAccounts()
    } catch (err: any) {
      toast.error(err.message || 'Failed to import CSV')
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
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
      <div className="flex justify-end items-center gap-2">
        <p className="text-[11px] text-zinc-500 mr-auto max-w-md">
          "type" column is optional (auto-detected from each class's header row if omitted). Re-importing merges by code — matching accounts are updated, new ones are added, nothing is duplicated or deleted.
        </p>
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
