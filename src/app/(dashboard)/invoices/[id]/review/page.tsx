'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Search, Loader2, Plus, ArrowLeft, ArrowRight, ArrowRightLeft, BookOpen, Check, Save, Trash2, Edit2, AlertCircle, Package, Receipt, Calculator, ChevronRight, Layers, LayoutGrid, Tag, FileText, CheckCircle2, History, TrendingUp, AlertTriangle, FileSpreadsheet, Download } from 'lucide-react'
import { STANDARD_UOMS } from '@/lib/constants'
import { formatRp } from '@/lib/format'

const UOM_AUTO_CONVERSIONS: Record<string, { purchase_unit: string; conversion_factor: number }> = {
  GR:  { purchase_unit: 'KG',   conversion_factor: 0.001 },
  KG:  { purchase_unit: 'KG',   conversion_factor: 1000 },
  ML:  { purchase_unit: 'L',    conversion_factor: 0.001 },
  L:   { purchase_unit: 'L',    conversion_factor: 1000 },
  MG:  { purchase_unit: 'KG',   conversion_factor: 0.000001 },
}

export default function InvoiceReviewPage() {
  const params = useParams()
  const router = useRouter()
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [invoice, setInvoice] = useState<any>(null)
  const [lineItems, setLineItems] = useState<any[]>([])
  const [itemMaster, setItemMaster] = useState<any[]>([])
  const [coa, setCoa] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])

  // Header accounts (is_header = true) cannot receive GL postings — they are rollup-only.
  // We use the DB-native is_header flag set by the hierarchy migration.
  const disabledCoaIds = useMemo(() => {
    const ids = new Set<string>()
    for (const acc of coa) {
      if (acc.is_header) ids.add(acc.id)
    }
    return ids
  }, [coa])

  const getCoaIndent = (code: string) => {
    if (!code) return '';
    const parts = code.split('-');
    let level = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!/^0+$/.test(parts[i])) {
        level = i;
        break;
      }
    }
    return '\u00A0\u00A0\u00A0\u00A0'.repeat(level);
  }
  const [orgId, setOrgId] = useState<string | null>(null)
  const [transportFee, setTransportFee] = useState<number>(0)
  const [newItemModalOpen, setNewItemModalOpen] = useState<number | string | null>(null)
  const [journalPreview, setJournalPreview] = useState<any[] | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [newItemData, setNewItemData] = useState<any>({
    default_coa_id: '',
    purchase_unit: '',
    conversion_factor: 1
  })
  const [selectedCreditCoaId, setSelectedCreditCoaId] = useState<string>('')
  const [dueDate, setDueDate] = useState<string>('')
  const [newVendorModalOpen, setNewVendorModalOpen] = useState(false)
  const [newVendorData, setNewVendorData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    bank_name: '',
    bank_account_no: '',
    bank_account_name: ''
  })

  // New posting flow states
  const [ppnCoaId, setPpnCoaId] = useState<string>('')
  const [freightCoaId, setFreightCoaId] = useState<string>('')
  const [ongkirOption, setOngkirOption] = useState<'distribute' | 'expense' | null>(null)
  const [ongkirModalOpen, setOngkirModalOpen] = useState(false)
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      
      // Get user's org_id
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()
      
      setOrgId(profile?.org_id || null)

      const { data: inv, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', params.id)
        .single()

      if (invError) {
        toast.error('Failed to load invoice')
        router.push('/invoices')
        return
      }

      setInvoice(inv)
      setDueDate(inv.due_date || inv.invoice_date || '')

      // Use local variable (not state) — state update is async
      const currentOrgId = profile?.org_id
      if (!currentOrgId) {
        toast.error('Could not determine your organization. Please log in again.')
        setLoading(false)
        return
      }

      // Explicitly filter by org_id — defense-in-depth on top of RLS
      const { data: items } = await supabase
        .from('item_master')
        .select('*')
        .eq('org_id', currentOrgId)
        .order('name')

      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('org_id', currentOrgId)
        .eq('is_active', true)
        .order('code')

      const { data: vendorsData } = await supabase
        .from('vendors')
        .select('*')
        .eq('org_id', currentOrgId)
        .order('name')

      setItemMaster(items || [])
      setCoa(accounts || [])
      setVendors(vendorsData || [])

      // Auto-match vendor_id if it is null but the vendor text is set and matches an existing vendor by name
      let updatedInv = { ...inv }
      if (!updatedInv.vendor_id && updatedInv.vendor && vendorsData) {
        const matchedVendor = vendorsData.find(
          (v: any) => v.name.toLowerCase().trim() === updatedInv.vendor.toLowerCase().trim()
        )
        if (matchedVendor) {
          updatedInv.vendor_id = matchedVendor.id
        }
      }
      setInvoice(updatedInv)

      // Load extracted items if available
      if (inv.extracted_data?.line_items) {
        const discountVal = inv.discount || 0
        const initialLines = inv.extracted_data.line_items.map((item: any, idx: number) => {
          // Smart matching: Try to find item by ID first, then by Name (case-insensitive)
          const matchedItem = (items || []).find(im => 
            im.id === item.item_master_id || 
            im.name.toLowerCase() === item.description?.toLowerCase()
          )
          
          const baseTotal = parseFloat(item.total) || (parseFloat(item.qty) * parseFloat(item.unit_price)) || 0
          
          return {
            ...item,
            id: item.id !== undefined ? item.id : idx,
            item_master_id: item.item_master_id || matchedItem?.id || null,
            coa_id: item.coa_id || matchedItem?.default_coa_id || null,
            is_inventory: item.is_inventory !== undefined ? item.is_inventory : (!!(item.item_master_id || matchedItem?.id) || true),
            original_total: baseTotal,
            total: baseTotal,
            unit_price: parseFloat(item.unit_price) || 0
          }
        })

        // Apply discount distribution immediately on load if discount exists
        const baseSubtotal = initialLines.reduce((acc: number, item: any) => acc + (item.original_total ?? item.total ?? 0), 0)
        const distributedLines = initialLines.map((item: any) => {
          const itemBaseTotal = item.original_total ?? item.total ?? 0
          const itemShare = baseSubtotal > 0 ? itemBaseTotal / baseSubtotal : 0
          const itemDiscountShare = itemShare * discountVal
          const newTotal = Math.max(0, itemBaseTotal - itemDiscountShare)
          
          return {
            ...item,
            total: newTotal,
            unit_price: item.qty > 0 ? newTotal / item.qty : 0
          }
        })

        setLineItems(distributedLines)

        // Pre-fill transport fee from AI-extracted shipping_cost
        if (inv.extracted_data.shipping_cost && inv.extracted_data.shipping_cost > 0) {
          setTransportFee(inv.extracted_data.shipping_cost)
        }
      }

      // If already posted, fetch the ACTUAL account used in GL
      if (inv?.status === 'posted') {
        const { data: glCredit } = await supabase
          .from('gl_entries')
          .select('coa_id')
          .eq('reference_id', inv.id)
          .eq('reference_type', 'invoice')
          .gt('credit', 0)
          .order('credit', { ascending: false }) // Get the primary credit
          .limit(1)
          .single()
        
        if (glCredit) {
          setSelectedCreditCoaId(glCredit.coa_id)
          setLoading(false)
          return
        }
      }

      // Fetch default mappings to resolve credit COA, PPN, and Freight COAs
      const { data: allMappings } = await supabase
        .from('default_coa_mappings')
        .select('account_role, coa_id')
        .eq('org_id', profile?.org_id)

      if (allMappings) {
        const apMap = allMappings.find(m => m.account_role === 'accounts_payable')
        const ppnMap = allMappings.find(m => m.account_role === 'ppn_masukan')
        const freightMap = allMappings.find(m => m.account_role === 'freight_expense')

        if (apMap?.coa_id) {
          setSelectedCreditCoaId(apMap.coa_id)
        } else {
          const apAccount = accounts?.find(acc => acc.code === '2-1-001')
          if (apAccount) setSelectedCreditCoaId(apAccount.id)
        }

        if (ppnMap?.coa_id) setPpnCoaId(ppnMap.coa_id)
        if (freightMap?.coa_id) setFreightCoaId(freightMap.coa_id)
      } else {
        // Fallback to hardcoded code '2-1-001'
        const apAccount = accounts?.find(acc => acc.code === '2-1-001')
        if (apAccount) setSelectedCreditCoaId(apAccount.id)
      }
      setLoading(false)
    }

    fetchData()
  }, [params.id, supabase, router])

  const handleDiscountChange = (discountVal: number) => {
    setInvoice((prev: any) => ({ ...prev, discount: discountVal }))
    
    setLineItems(prev => {
      const baseSubtotal = prev.reduce((acc, item) => acc + (item.original_total ?? item.total ?? 0), 0)
      
      return prev.map(item => {
        const itemBaseTotal = item.original_total ?? item.total ?? 0
        const itemShare = baseSubtotal > 0 ? itemBaseTotal / baseSubtotal : 0
        const itemDiscountShare = itemShare * discountVal
        const newTotal = Math.max(0, itemBaseTotal - itemDiscountShare)
        
        return {
          ...item,
          original_total: itemBaseTotal,
          total: newTotal,
          unit_price: item.qty > 0 ? newTotal / item.qty : 0
        }
      })
    })
  }

  const updateLineItem = (id: number | string, field: string, value: any) => {
    setLineItems(prev => {
      const updatedLines = prev.map(item => {
        if (String(item.id) === String(id)) {
          let updated = { ...item, [field]: value }
          
          // Auto-match COA when item is selected
          if (field === 'item_master_id' && value) {
            const matchedItem = itemMaster.find(im => im.id === value)
            if (matchedItem?.default_coa_id) {
              updated.coa_id = matchedItem.default_coa_id
              updated.is_inventory = true
            }
          }

          if (field === 'qty' || field === 'unit_price') {
            updated.original_total = (updated.qty || 0) * (updated.unit_price || 0)
          } else if (field === 'total') {
            if (updated.qty) {
              updated.unit_price = (updated.total || 0) / updated.qty
            }
            updated.original_total = updated.total
          }
          return updated
        }
        return item
      })

      // Immediately distribute current discount across all lines
      const discountVal = invoice?.discount || 0
      const baseSubtotal = updatedLines.reduce((acc, item) => acc + (item.original_total ?? item.total ?? 0), 0)
      
      return updatedLines.map(item => {
        const itemBaseTotal = item.original_total ?? item.total ?? 0
        const itemShare = baseSubtotal > 0 ? itemBaseTotal / baseSubtotal : 0
        const itemDiscountShare = itemShare * discountVal
        const newTotal = Math.max(0, itemBaseTotal - itemDiscountShare)
        
        return {
          ...item,
          original_total: itemBaseTotal,
          total: newTotal,
          unit_price: item.qty > 0 ? newTotal / item.qty : 0
        }
      })
    })
  }

  const removeLineItem = (id: number | string) => {
    setLineItems(prev => {
      const remainingLines = prev.filter(item => String(item.id) !== String(id))
      
      // Redistribute discount over remaining lines
      const discountVal = invoice?.discount || 0
      const baseSubtotal = remainingLines.reduce((acc, item) => acc + (item.original_total ?? item.total ?? 0), 0)
      
      return remainingLines.map(item => {
        const itemBaseTotal = item.original_total ?? item.total ?? 0
        const itemShare = baseSubtotal > 0 ? itemBaseTotal / baseSubtotal : 0
        const itemDiscountShare = itemShare * discountVal
        const newTotal = Math.max(0, itemBaseTotal - itemDiscountShare)
        
        return {
          ...item,
          original_total: itemBaseTotal,
          total: newTotal,
          unit_price: item.qty > 0 ? newTotal / item.qty : 0
        }
      })
    })
  }

  const addLineItem = () => {
    const newId = lineItems.length > 0 ? Math.max(...lineItems.map(i => i.id)) + 1 : 0
    setLineItems(prev => [...prev, {
      id: newId,
      description: 'New Item',
      qty: 1,
      unit_price: 0,
      total: 0,
      original_total: 0,
      item_master_id: null,
      coa_id: null,
      is_inventory: true
    }])
  }

  const calculatedSubtotal = lineItems.reduce((acc, item) => acc + (item.original_total ?? item.total ?? 0), 0)
  const calculatedDiscount = invoice?.discount || 0
  const calculatedTax = invoice?.tax_total || 0
  const calculatedGrandTotal = calculatedSubtotal - calculatedDiscount + calculatedTax + transportFee

  const preparePostLines = (option: 'distribute' | 'expense') => {
    let processedLines = [...lineItems]
    let finalFreightAmount = 0
    
    if (transportFee > 0) {
      if (option === 'distribute') {
        // Distribute proportionally ONLY to inventory items (PSAK 14 compliance)
        const totalSubtotal = processedLines.reduce((acc, item) => acc + (item.total || 0), 0)
        let distributedFreight = 0
        
        if (totalSubtotal > 0) {
          processedLines = processedLines.map(item => {
            const itemFreightShare = (((item.total || 0) / totalSubtotal) * transportFee)
            if (item.is_inventory) {
              const itemLanded = (item.total || 0) + itemFreightShare
              distributedFreight += itemFreightShare
              return {
                ...item,
                total: itemLanded,
                unit_price: item.qty > 0 ? itemLanded / item.qty : 0
              }
            }
            return item
          })
        }
        // Sisa ongkir yang tidak ter-distribusi -> post sebagai Freight Expense
        finalFreightAmount = transportFee - distributedFreight
      } else {
        // Option B: Post as Freight Expense
        finalFreightAmount = transportFee
      }
    }
    
    return {
      p_lines: processedLines.map(item => ({
        item_id: item.is_inventory ? item.item_master_id : null,
        qty: item.qty,
        unit_price: item.unit_price,
        total_price: item.total,
        description: item.description,
        coa_id: item.coa_id,
        is_inventory: item.is_inventory
      })),
      p_freight_amount: finalFreightAmount,
      p_freight_distributed: option === 'distribute'
    }
  }

  const handleRefreshPreview = async (silentParam?: boolean | any) => {
    const silent = silentParam === true
    if (!orgId || !invoice?.id) return
    
    // Validation gate for PPN COA mapping
    if (calculatedTax > 0 && !ppnCoaId) {
      if (!silent) toast.error('PPN Masukan (Input Tax) account not configured in Settings > Accounting.')
      return
    }
    
    // Validation gate for Freight COA mapping if expense option is selected
    if (transportFee > 0 && !ongkirOption) {
      if (!silent) toast.error('Please select an Ongkir Posting Method first.')
      return
    }
    if (transportFee > 0 && ongkirOption === 'expense' && !freightCoaId) {
      if (!silent) toast.error('Freight/Transport Expense account not configured in Settings > Accounting.')
      return
    }
    
    const option = transportFee > 0 ? (ongkirOption || 'expense') : 'expense'
    const { p_lines, p_freight_amount, p_freight_distributed } = preparePostLines(option)
    
    console.log('Refreshing preview with credit COA:', selectedCreditCoaId)
    setLoadingPreview(true)
    try {
      const { data, error } = await supabase.rpc('preview_journal', {
        p_invoice_id: invoice.id,
        p_org_id: orgId,
        p_lines: p_lines,
        p_credit_coa_id: selectedCreditCoaId || null,
        p_tax_amount: calculatedTax,
        p_tax_coa_id: ppnCoaId || null,
        p_freight_amount: p_freight_amount,
        p_freight_coa_id: freightCoaId || null,
        p_freight_distributed: p_freight_distributed
      })
      if (error) throw error
      setJournalPreview(data || [])
    } catch (error: any) {
      if (!silent) toast.error(error.message || 'Failed to preview journal')
    } finally {
      setLoadingPreview(false)
    }
  }

  // Auto-refresh journal preview when input values change (debounced 500ms)
  useEffect(() => {
    if (!orgId || !invoice?.id) return

    const timer = setTimeout(() => {
      handleRefreshPreview(true)
    }, 500)

    return () => clearTimeout(timer)
  }, [
    lineItems,
    selectedCreditCoaId,
    calculatedTax,
    transportFee,
    ongkirOption,
    orgId,
    invoice?.id,
    ppnCoaId,
    freightCoaId
  ])

  const handleCreateNewItem = async () => {
    if (!newItemData.name || !newItemData.unit) {
      toast.error('Name and unit are required')
      return
    }

    const existing = itemMaster.find(im => im.name.toLowerCase() === newItemData.name?.toLowerCase())
    if (existing) {
      toast.error(`Item "${newItemData.name}" already exists in your catalog.`)
      return
    }

    setPosting(true)
    try {
      const { data, error } = await supabase
        .from('item_master')
        .insert({
          org_id: orgId,
          name: newItemData.name,
          unit: newItemData.unit,
          category: newItemData.category,
          default_coa_id: newItemData.default_coa_id || null,
          purchase_unit: newItemData.purchase_unit || newItemData.unit,
          conversion_factor: newItemData.conversion_factor || 1,
          is_inventory: true
        })
        .select()
        .single()

      if (error) throw error

      setItemMaster(prev => [...prev, data])
      
      if (newItemModalOpen !== null) {
        updateLineItem(newItemModalOpen, 'item_master_id', data.id)
        if (data.default_coa_id) {
          updateLineItem(newItemModalOpen, 'coa_id', data.default_coa_id)
        }
      }

      setNewItemModalOpen(null)
      toast.success('New stock item created successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create item')
    } finally {
      setPosting(false)
  }
}

  const handleCreateNewVendor = async () => {
    if (!newVendorData.name.trim()) {
      toast.error('Vendor name is required')
      return
    }

    const existing = vendors.find(v => v.name.toLowerCase() === newVendorData.name.trim().toLowerCase())
    if (existing) {
      toast.error(`Vendor "${newVendorData.name}" already exists in your records.`)
      return
    }

    setPosting(true)
    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert({
          org_id: orgId,
          name: newVendorData.name.trim(),
          email: newVendorData.email.trim() || null,
          phone: newVendorData.phone.trim() || null,
          address: newVendorData.address.trim() || null,
          bank_name: newVendorData.bank_name.trim() || null,
          bank_account_no: newVendorData.bank_account_no.trim() || null,
          bank_account_name: newVendorData.bank_account_name.trim() || null
        })
        .select()
        .single()

      if (error) throw error

      setVendors((prev: any[]) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setInvoice((prev: any) => ({ ...prev, vendor_id: data.id, vendor: data.name }))
      setNewVendorModalOpen(false)
      toast.success('New vendor created successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create vendor')
    } finally {
      setPosting(false)
    }
  }

  const handlePost = async () => {
    if (invoice.status === 'posted') return

    // Validation
    const invalid = lineItems.filter(item => !item.coa_id || (item.is_inventory && !item.item_master_id))
    if (invalid.length > 0) {
      toast.error('Please map all items to a COA account. Inventory items also require an Item Master match.')
      return
    }

    const selectedCoa = coa.find(c => c.id === selectedCreditCoaId)
    const isAPAccount = selectedCoa && selectedCoa.type === 'liability' && selectedCoa.code.startsWith('2-1-10')
    if (isAPAccount && !dueDate) {
      toast.error('Payment Due Date is required when closing to an Accounts Payable account.')
      return
    }

    // PPN Configuration validation gate
    if (calculatedTax > 0 && !ppnCoaId) {
      toast.error('PPN Masukan (Input Tax) account not configured in Settings > Accounting. Please set it before posting.')
      return
    }

    // Ongkir Choice validation gate
    if (transportFee > 0 && !ongkirOption) {
      const hasInventory = lineItems.some(item => item.is_inventory)
      if (!hasInventory) {
        setOngkirOption('expense')
        executePost('expense')
      } else {
        setOngkirModalOpen(true)
      }
      return
    }

    // Freight Configuration validation gate
    if (transportFee > 0 && ongkirOption === 'expense' && !freightCoaId) {
      toast.error('Freight/Transport Expense account not configured in Settings > Accounting. Please set it before posting.')
      return
    }

    executePost(ongkirOption || 'expense')
  }

  const executePost = async (option: 'distribute' | 'expense') => {
    setPosting(true)
    try {
      const { p_lines, p_freight_amount, p_freight_distributed } = preparePostLines(option)

      // 1. Update invoice metadata first
      const { error: updateError } = await supabase.from('invoices').update({
        subtotal: calculatedSubtotal,
        tax_total: calculatedTax,
        grand_total: calculatedGrandTotal,
        vendor: invoice.vendor,
        vendor_id: invoice.vendor_id,
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        due_date: dueDate || null,
        discount: invoice.discount || 0,
      }).eq('id', invoice.id)

      if (updateError) {
        console.error('Invoice update error:', JSON.stringify(updateError))
        throw new Error(`Failed to update invoice: ${updateError.message}`)
      }

      // 2. Call the post_invoice RPC
      const { error: rpcError } = await supabase.rpc('post_invoice', {
        p_invoice_id: invoice.id,
        p_outlet_id: selectedOutletId,
        p_org_id: orgId,
        p_lines: p_lines,
        p_credit_coa_id: selectedCreditCoaId || null,
        p_tax_amount: calculatedTax,
        p_tax_coa_id: ppnCoaId || null,
        p_freight_amount: p_freight_amount,
        p_freight_coa_id: freightCoaId || null,
        p_freight_distributed: p_freight_distributed
      })

      if (rpcError) {
        console.error('RPC error (raw):', JSON.stringify(rpcError))
        throw new Error(`Post failed: ${rpcError.message || rpcError.details || rpcError.hint || JSON.stringify(rpcError)}`)
      }

      toast.success('Invoice recorded and journalized successfully!')
      router.push('/invoices')
    } catch (error: any) {
      console.error('Post error:', error?.message || JSON.stringify(error))
      toast.error(error?.message || 'Failed to post invoice')
    } finally {
      setPosting(false)
    }
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      const payload = {
        subtotal: calculatedSubtotal,
        tax_total: calculatedTax,
        grand_total: calculatedGrandTotal,
        vendor: invoice.vendor,
        vendor_id: invoice.vendor_id,
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        due_date: dueDate || null,
        discount: invoice.discount || 0,
        status: 'pending',
        extracted_data: {
          ...invoice.extracted_data,
          line_items: lineItems,
        }
      }
      await supabase.from('invoices').update(payload).eq('id', invoice.id)
      setInvoice({ ...invoice, ...payload })
      toast.success('Draft saved as pending.')
    } catch (error: any) {
      toast.error('Failed to save draft.')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async () => {
    setApproving(true)
    try {
      const payload = {
        subtotal: calculatedSubtotal,
        tax_total: calculatedTax,
        grand_total: calculatedGrandTotal,
        vendor: invoice.vendor,
        vendor_id: invoice.vendor_id,
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        due_date: dueDate || null,
        discount: invoice.discount || 0,
        status: 'reviewed',
        extracted_data: {
          ...invoice.extracted_data,
          line_items: lineItems,
        }
      }
      await supabase.from('invoices').update(payload).eq('id', invoice.id)
      setInvoice({ ...invoice, ...payload })
      toast.success('Invoice approved and marked as reviewed.')
    } catch (error: any) {
      toast.error('Failed to approve invoice.')
    } finally {
      setApproving(false)
    }
  }

  const handleVoid = async () => {
    if (!invoice?.id) return
    setVoiding(true)
    const toastId = toast.loading('Reversing journal and inventory entries...')
    try {
      const { error } = await supabase.rpc('void_invoice', {
        p_invoice_id: invoice.id
      })

      if (error) {
        throw new Error(error.message || JSON.stringify(error))
      }

      toast.success('Invoice successfully voided! It is now unlocked for editing.', { id: toastId })
      
      // Update state to match new database values
      setInvoice((prev: any) => ({
        ...prev,
        status: 'reviewed',
        approved_at: null,
        approved_by: null,
        payment_status: 'unpaid',
        paid_amount: 0
      }))
      
      setVoidDialogOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to void invoice', { id: toastId })
    } finally {
      setVoiding(false)
    }
  }

  if (loading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>

  const isPosted = invoice.status === 'posted'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Review & Journalize</h2>
            <p className="text-zinc-400 text-sm">Review extracted data and map to accounting accounts.</p>
          </div>
        </div>
        <div className="flex gap-3">
          {isPosted && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 text-sm font-medium">
                <Check className="h-3.5 w-3.5" /> Posted
              </div>
              <Button
                variant="outline"
                className="border-red-900/50 bg-red-950/10 text-red-400 hover:bg-red-900/20"
                onClick={() => setVoidDialogOpen(true)}
                disabled={voiding}
              >
                {voiding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Void / Unpost
              </Button>
            </div>
          )}
          {!isPosted && (
            <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-300" onClick={handleSaveDraft} disabled={saving || approving || posting}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save / Pending
            </Button>
          )}
          {!isPosted && invoice?.status !== 'reviewed' && (
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleApprove} disabled={saving || approving || posting}>
              {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Approve
            </Button>
          )}
          {!isPosted && invoice?.status === 'reviewed' && (
            <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handlePost} disabled={saving || approving || posting}>
              {posting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookOpen className="mr-2 h-4 w-4" />}
              Post
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Invoice Image */}
        <div className="xl:col-span-5 space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden sticky top-8">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/50 py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                {invoice.image_url?.toLowerCase()?.includes('.pdf') ? (
                  <FileText className="h-4 w-4 text-red-400" />
                ) : (
                  <Receipt className="h-4 w-4 text-zinc-500" />
                )}
                Digital Copy
              </CardTitle>
              <a
                href={invoice.image_url}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                Open <ArrowRight className="h-3 w-3" />
              </a>
            </CardHeader>
            <CardContent className="p-0 bg-black" style={{ height: '75vh' }}>
              {invoice.image_url?.includes('drive.google.com') ? (
                <iframe
                  src={(() => {
                    const match = invoice.image_url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                    return match && match[1] ? `https://drive.google.com/file/d/${match[1]}/preview` : invoice.image_url;
                  })()}
                  className="w-full h-full border-0"
                  title="Invoice Google Drive Preview"
                  allow="autoplay"
                />
              ) : invoice.image_url?.toLowerCase()?.includes('.pdf') ? (
                <iframe
                  src={`${invoice.image_url}#toolbar=1&navpanes=1&scrollbar=1`}
                  className="w-full h-full border-0"
                  title="Invoice PDF Preview"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full min-h-[500px]">
                  <img src={invoice.image_url} alt="Invoice" className="max-w-full h-auto max-h-full object-contain" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Data Table */}
        <div className="xl:col-span-7 space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="border-b border-zinc-800 py-3">
              <CardTitle className="text-sm font-medium text-zinc-400">Header Information</CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold flex justify-between items-center">
                  Vendor
                  {!isPosted && (
                    <button 
                      type="button"
                      onClick={() => {
                        setNewVendorData({
                          name: '',
                          email: '',
                          phone: '',
                          address: '',
                          bank_name: '',
                          bank_account_no: '',
                          bank_account_name: ''
                        })
                        setNewVendorModalOpen(true)
                      }} 
                      className="text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Add New
                    </button>
                  )}
                </label>
                <select 
                  value={invoice.vendor_id ?? ''} 
                  onChange={(e) => {
                    const selectedVendor = vendors.find(v => v.id === e.target.value)
                    setInvoice({...invoice, vendor_id: e.target.value, vendor: selectedVendor?.name || invoice.vendor})
                  }} 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded h-8 text-sm px-2 text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isPosted}
                >
                  <option value="">Select Vendor...</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Invoice No</label>
                <Input value={invoice.invoice_no ?? ''} onChange={(e) => setInvoice({...invoice, invoice_no: e.target.value})} className="bg-zinc-950 border-zinc-800 h-8 text-sm" disabled={isPosted} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Invoice Date</label>
                <Input type="date" value={invoice.invoice_date ?? ''} onChange={(e) => setInvoice({...invoice, invoice_date: e.target.value})} className="bg-zinc-950 border-zinc-800 h-8 text-sm" disabled={isPosted} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="border-b border-zinc-800 py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-400">Line Items & Account Mapping</CardTitle>
              <Button variant="ghost" size="sm" onClick={addLineItem} className="h-8 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300" disabled={isPosted}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-zinc-800">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[80px] text-zinc-500 text-[10px] uppercase font-bold">Stock?</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] uppercase font-bold">Description / Mapping</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-right">Qty</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-right">Amount</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/20">
                      <TableCell className="text-center">
                        <Switch 
                          checked={item.is_inventory} 
                          onCheckedChange={(val) => updateLineItem(item.id, 'is_inventory', val)}
                          disabled={isPosted}
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-2">
                          <Input 
                            value={item.description ?? ''}
                            onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                            className="bg-zinc-950 border-zinc-800 h-8 text-xs font-medium"
                            disabled={isPosted}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Select value={item.coa_id || ''} onValueChange={(val) => updateLineItem(item.id, 'coa_id', val)} disabled={isPosted}>
                              <SelectTrigger className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 h-7 text-[10px] text-zinc-300 focus:outline-none">
                                <span className="truncate text-left flex-1">
                                  {item.coa_id ? (
                                    coa.find(a => a.id === item.coa_id) 
                                      ? `${coa.find(a => a.id === item.coa_id)?.code} - ${coa.find(a => a.id === item.coa_id)?.name}`
                                      : item.coa_id
                                  ) : 'Select Account...'}
                                </span>
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 border-zinc-800 w-max min-w-[250px]">
                                {coa.map(acc => {
                                  const isMain = disabledCoaIds.has(acc.id);
                                  const indent = getCoaIndent(acc.code);
                                  return (
                                    <SelectItem key={acc.id} value={acc.id} disabled={isMain} className={isMain ? "font-bold text-zinc-500" : ""}>
                                      {indent}{acc.code} - {acc.name} {isMain ? '(Main)' : ''}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            
                            {item.is_inventory ? (
                              <div className="flex gap-1 items-center">
                                <select 
                                  className="bg-zinc-950 border border-zinc-800 rounded px-2 h-7 text-[10px] text-emerald-400/80 focus:outline-none flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                  value={item.item_master_id || ''}
                                  onChange={(e) => updateLineItem(item.id, 'item_master_id', e.target.value)}
                                  disabled={isPosted}
                                >
                                  <option value="">Map to Stock Item...</option>
                                  {itemMaster.map(im => <option key={im.id} value={im.id}>{im.name}</option>)}
                                </select>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-emerald-400 border border-zinc-800 rounded flex-shrink-0" 
                                  onClick={() => {
                                    const rawUnit = (item.unit || 'PCS').toUpperCase().trim()
                                    let unit = 'PCS'
                                    let purchaseUnit = 'PCS'
                                    let conversionFactor = 1
 
                                    if (rawUnit === 'KG') {
                                      unit = 'GR'
                                      purchaseUnit = 'KG'
                                      conversionFactor = 1000
                                    } else if (rawUnit === 'L') {
                                      unit = 'ML'
                                      purchaseUnit = 'L'
                                      conversionFactor = 1000
                                    } else if (rawUnit === 'GR') {
                                      unit = 'GR'
                                      purchaseUnit = 'KG'
                                      conversionFactor = 0.001
                                    } else if (rawUnit === 'ML') {
                                      unit = 'ML'
                                      purchaseUnit = 'L'
                                      conversionFactor = 0.001
                                    } else {
                                      const matchedStandard = STANDARD_UOMS.find(u => u === rawUnit)
                                      unit = matchedStandard || 'PCS'
                                      purchaseUnit = matchedStandard || 'PCS'
                                      conversionFactor = 1
                                    }
 
                                    setNewItemData({
                                      name: item.description || '',
                                      unit: unit,
                                      category: 'raw',
                                      default_coa_id: item.coa_id || '',
                                      purchase_unit: purchaseUnit,
                                      conversion_factor: conversionFactor
                                    })
                                    setNewItemModalOpen(item.id)
                                  }}
                                  title="Add new item"
                                  disabled={isPosted}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="h-7 border border-zinc-800/30 rounded flex items-center px-2 text-[10px] text-zinc-600 bg-zinc-950/50 italic">
                                Direct Expense
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input 
                          type="number" 
                          value={isNaN(item.qty) ? 0 : (item.qty ?? 0)} 
                          onChange={(e) => updateLineItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
                          className="bg-zinc-950 border-zinc-800 h-7 text-xs w-16 ml-auto text-right font-mono"
                          disabled={isPosted}
                        />
                        {item.item_master_id && (() => {
                          const im = itemMaster.find(x => x.id === item.item_master_id)
                          if (im && im.conversion_factor > 1) {
                            return <div className="text-[9px] text-blue-400 mt-1 uppercase font-bold">= {(item.qty * im.conversion_factor).toLocaleString()} {im.unit}</div>
                          }
                          return null
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <Input 
                            type="number" 
                            value={isNaN(item.unit_price) ? 0 : (item.unit_price ?? 0)} 
                            onChange={(e) => updateLineItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="bg-zinc-950 border-zinc-800 h-7 text-xs w-24 text-right font-mono"
                            disabled={isPosted}
                          />
                          <Input 
                            type="number" 
                            value={isNaN(item.total) ? 0 : (item.total ?? 0)} 
                            onChange={(e) => updateLineItem(item.id, 'total', parseFloat(e.target.value) || 0)}
                            className="bg-zinc-950 border-zinc-800 h-7 text-xs w-28 text-right font-mono font-bold text-zinc-100"
                            disabled={isPosted}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-600 hover:text-red-400" onClick={() => removeLineItem(item.id)} disabled={isPosted}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Totals */}
            <Card className="border-zinc-800 bg-zinc-900 border-l-4 border-l-zinc-100 h-fit">
              <CardContent className="p-6 space-y-3">
                <div className="flex justify-between text-zinc-400 text-sm">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatRp(calculatedSubtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-red-400 text-sm">
                  <span>Discount</span>
                  <Input 
                    type="number" 
                    value={isNaN(invoice.discount) ? 0 : (invoice.discount ?? 0)} 
                    onChange={(e) => handleDiscountChange(parseFloat(e.target.value) || 0)} 
                    className="bg-zinc-950 border-zinc-800 h-7 w-24 text-right font-mono text-red-400" 
                    disabled={isPosted}
                  />
                </div>
                <div className="flex justify-between items-center text-zinc-400 text-sm">
                  <span>Tax (PPN/PB1)</span>
                  <Input type="number" value={isNaN(invoice.tax_total) ? 0 : (invoice.tax_total ?? 0)} onChange={(e) => setInvoice({...invoice, tax_total: parseFloat(e.target.value) || 0})} className="bg-zinc-950 border-zinc-800 h-7 w-24 text-right font-mono" disabled={isPosted} />
                </div>
                <div className="flex justify-between items-center text-amber-400/80 text-sm">
                  <span>Transport (Ongkir)</span>
                  <Input type="number" value={isNaN(transportFee) ? 0 : (transportFee ?? 0)} onChange={(e) => setTransportFee(parseFloat(e.target.value) || 0)} className="bg-zinc-950 border-zinc-800 h-7 w-24 text-right font-mono" disabled={isPosted} />
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
                  <span className="text-lg font-bold text-zinc-100">Grand Total</span>
                  <span className="text-2xl font-bold text-zinc-100 font-mono">{formatRp(calculatedGrandTotal)}</span>
                </div>
                
                {transportFee > 0 && (
                  <div className="space-y-2 mt-2 pt-3 border-t border-zinc-800/50">
                    <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
                      <span>Ongkir Posting Method</span>
                      {ongkirOption === 'distribute' && (
                        <span className="text-[10px] text-emerald-400 font-normal">
                          PSAK 14: Landed Cost
                        </span>
                      )}
                      {ongkirOption === 'expense' && (
                        <span className="text-[10px] text-zinc-400 font-normal">
                          Freight Expense
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-8 text-xs font-semibold rounded-md border transition-all ${
                          ongkirOption === 'distribute'
                            ? 'bg-zinc-100 text-zinc-900 border-zinc-100 hover:bg-zinc-200'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-300'
                        }`}
                        onClick={() => {
                          setOngkirOption('distribute')
                          setTimeout(() => handleRefreshPreview(), 100)
                        }}
                        disabled={!lineItems.some(item => item.is_inventory) || isPosted}
                        title={!lineItems.some(item => item.is_inventory) ? 'No inventory items to distribute to' : ''}
                      >
                        Landed Cost
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-8 text-xs font-semibold rounded-md border transition-all ${
                          ongkirOption === 'expense'
                            ? 'bg-zinc-100 text-zinc-900 border-zinc-100 hover:bg-zinc-200'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-300'
                        }`}
                        onClick={() => {
                          setOngkirOption('expense')
                          setTimeout(() => handleRefreshPreview(), 100)
                        }}
                        disabled={isPosted}
                      >
                        Freight Expense
                      </Button>
                    </div>
                  </div>
                )}

                {/* Closing Account Selection */}
                <div className="pt-4 mt-2 border-t border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Closing Account (Credit)</label>
                    <span className="text-[10px] text-zinc-600 italic">Usually Hutang or Cash</span>
                  </div>
                  <Select value={selectedCreditCoaId || ""} onValueChange={(val) => setSelectedCreditCoaId(val || "")} disabled={isPosted}>
                    <SelectTrigger className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 h-10 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-700">
                      <span className="truncate text-left flex-1">
                        {selectedCreditCoaId ? (
                          coa.find(a => a.id === selectedCreditCoaId) 
                            ? `${coa.find(a => a.id === selectedCreditCoaId)?.code} - ${coa.find(a => a.id === selectedCreditCoaId)?.name}`
                            : selectedCreditCoaId
                        ) : 'Select Closing Account...'}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 w-max min-w-[250px]">
                      {coa.map(acc => {
                        const isMain = disabledCoaIds.has(acc.id);
                        const indent = getCoaIndent(acc.code);
                        return (
                          <SelectItem key={acc.id} value={acc.id} disabled={isMain} className={isMain ? "font-bold text-zinc-500" : ""}>
                            {indent}{acc.code} - {acc.name} {isMain ? '(Main)' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  {/* Payment Due Date for AP Accounts */}
                  {selectedCreditCoaId && coa.find(a => a.id === selectedCreditCoaId)?.type === 'liability' && coa.find(a => a.id === selectedCreditCoaId)?.code.startsWith('2-1-10') && (
                    <div className="pt-3 border-t border-zinc-800/50 mt-3 flex items-center justify-between">
                      <div>
                        <label className="text-xs text-zinc-400 font-medium block uppercase tracking-wider">Payment Due Date</label>
                        <span className="text-[10px] text-zinc-600 italic">Required for AP Aging</span>
                      </div>
                      <Input 
                        type="date" 
                        value={dueDate} 
                        onChange={(e) => setDueDate(e.target.value)} 
                        className="bg-zinc-950 border-zinc-800 h-8 w-[140px] text-sm text-zinc-300"
                        disabled={isPosted}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Journal Preview */}
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="border-b border-zinc-800 py-3 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] uppercase font-bold text-zinc-500 flex items-center gap-2">
                  <ArrowRightLeft className="h-3 w-3" /> Journal Preview
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleRefreshPreview} 
                  disabled={loadingPreview}
                  className="h-6 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  {loadingPreview ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {!journalPreview ? (
                  <div className="text-center text-zinc-600 text-xs py-4">
                    Click Refresh to generate preview from accounting rules.
                  </div>
                ) : journalPreview.length === 0 ? (
                  <div className="text-center text-zinc-600 text-xs py-4">
                    No journal entries generated. Check COA mappings.
                  </div>
                ) : (
                  <>
                    {journalPreview.map((entry, idx) => (
                      <div key={idx} className={`flex justify-between text-[11px] ${entry.debit > 0 ? '' : 'pt-2 border-t border-zinc-800'}`}>
                        <span className={`${entry.debit > 0 ? 'text-emerald-400' : 'text-amber-400 ml-4'} font-medium`}>
                          {entry.debit > 0 ? 'DR' : 'CR'} {entry.coa_name || entry.coa_code}
                        </span>
                        <span className="text-zinc-400 font-mono">
                          {formatRp(entry.debit > 0 ? entry.debit : entry.credit)}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* New Item Modal */}
      <Dialog open={newItemModalOpen !== null} onOpenChange={(open) => !open && setNewItemModalOpen(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Create New Stock Item</DialogTitle>
            <DialogDescription className="text-zinc-400">Quickly add a new item to your master data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Item Name</label>
              <Input 
                value={newItemData.name ?? ''}
                onChange={e => setNewItemData({...newItemData, name: e.target.value})}
                className="bg-zinc-900 border-zinc-800 h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Category</label>
                <select 
                  value={newItemData.category}
                  onChange={e => setNewItemData({...newItemData, category: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 h-9 text-sm text-zinc-100 focus:outline-none"
                >
                  <option value="raw">Raw Material</option>
                  <option value="wip">WIP</option>
                  <option value="packaging">Packaging</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Default COA (Optional)</label>
                <Select value={newItemData.default_coa_id || ""} onValueChange={(val) => setNewItemData({...newItemData, default_coa_id: val})}>
                  <SelectTrigger className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 h-9 text-sm text-zinc-100 focus:outline-none">
                    <span className="truncate text-left flex-1">
                      {newItemData.default_coa_id ? (
                        coa.find(a => a.id === newItemData.default_coa_id) 
                          ? `${coa.find(a => a.id === newItemData.default_coa_id)?.code} - ${coa.find(a => a.id === newItemData.default_coa_id)?.name}`
                          : newItemData.default_coa_id
                      ) : 'No Default Account'}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 max-h-[300px] w-max min-w-[250px]">
                    {coa.map(acc => {
                      const isMain = disabledCoaIds.has(acc.id);
                      const indent = getCoaIndent(acc.code);
                      return (
                        <SelectItem key={acc.id} value={acc.id} disabled={isMain} className={isMain ? "font-bold text-zinc-500" : ""}>
                          {indent}{acc.code} - {acc.name} {isMain ? '(Main)' : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest flex items-center gap-2">
                <Layers className="h-3 w-3 text-blue-500" /> UOM Conversion Formula
              </p>
              <div className="flex items-center gap-2 bg-zinc-950/30 p-2.5 rounded-lg border border-zinc-800/50">
                <span className="text-zinc-500 font-mono text-sm pl-1">1</span>
                <div className="flex-1">
                  <Input 
                    value={newItemData.purchase_unit ?? ''}
                    onChange={e => setNewItemData({...newItemData, purchase_unit: e.target.value})}
                    className="bg-zinc-900 border-zinc-800 h-8 text-xs"
                    placeholder="Purchase Unit"
                  />
                </div>
                <span className="text-zinc-500 font-mono text-sm">=</span>
                <div className="flex-1">
                  <Input 
                    type="number"
                    value={isNaN(newItemData.conversion_factor) ? 1 : (newItemData.conversion_factor ?? 1)}
                    onChange={e => setNewItemData({...newItemData, conversion_factor: parseFloat(e.target.value) || 1})}
                    className="bg-zinc-900 border-zinc-800 h-8 text-xs text-center"
                  />
                </div>
                <div className="flex-1">
                  <select 
                    value={newItemData.unit}
                    onChange={e => {
                      const newUnit = e.target.value
                      const auto = UOM_AUTO_CONVERSIONS[newUnit]
                      setNewItemData({
                        ...newItemData,
                        unit: newUnit,
                        ...(auto ? { purchase_unit: auto.purchase_unit, conversion_factor: auto.conversion_factor } : {})
                      })
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 h-8 text-[10px] text-zinc-100 focus:outline-none"
                  >
                    {STANDARD_UOMS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[9px] text-zinc-500 italic pl-1">
                Example: 1 <strong>Bottle</strong> = <strong>500</strong> <strong>ML</strong>.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewItemModalOpen(null)} className="border-zinc-800 bg-zinc-900 text-zinc-300">
              Cancel
            </Button>
            <Button onClick={handleCreateNewItem} disabled={posting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {posting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ongkir Posting Choice Modal */}
      <Dialog open={ongkirModalOpen} onOpenChange={setOngkirModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Ongkir Posting Method Required
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              An Ongkos Kirim of <strong>{formatRp(transportFee)}</strong> was detected. Please choose how you want to journalize this fee:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              variant="outline"
              className="w-full h-auto py-3 px-4 flex flex-col items-start gap-1 border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 text-left rounded-lg transition-all"
              onClick={() => {
                setOngkirOption('distribute')
                setOngkirModalOpen(false)
                executePost('distribute')
              }}
              disabled={!lineItems.some(item => item.is_inventory)}
            >
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                <Layers className="h-4 w-4" />
                Option A: Landed Cost (PSAK 14)
              </div>
              <p className="text-xs text-zinc-400 font-normal">
                Distribute Ongkir proportionally to inventory items. Direct expenses will be excluded.
              </p>
            </Button>

            <Button
              variant="outline"
              className="w-full h-auto py-3 px-4 flex flex-col items-start gap-1 border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 text-left rounded-lg transition-all"
              onClick={() => {
                setOngkirOption('expense')
                setOngkirModalOpen(false)
                executePost('expense')
              }}
            >
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-200">
                <FileText className="h-4 w-4 text-zinc-400" />
                Option B: Post as Freight Expense
              </div>
              <p className="text-xs text-zinc-400 font-normal">
                Post Ongkir separately to the Freight/Transport Expense account. Item unit costs remain clean.
              </p>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOngkirModalOpen(false)} className="border-zinc-800 bg-zinc-900 text-zinc-300">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Vendor Modal */}
      <Dialog open={newVendorModalOpen} onOpenChange={setNewVendorModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Create New Vendor</DialogTitle>
            <DialogDescription className="text-zinc-400">Add a new supplier to your organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Vendor Name *</label>
              <Input 
                value={newVendorData.name}
                onChange={e => setNewVendorData({...newVendorData, name: e.target.value})}
                className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                placeholder="Vendor / Supplier Name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Email</label>
                <Input 
                  value={newVendorData.email}
                  onChange={e => setNewVendorData({...newVendorData, email: e.target.value})}
                  className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                  placeholder="email@vendor.com"
                  type="email"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Phone</label>
                <Input 
                  value={newVendorData.phone}
                  onChange={e => setNewVendorData({...newVendorData, phone: e.target.value})}
                  className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                  placeholder="0812xxxxxx"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Address</label>
              <Input 
                value={newVendorData.address}
                onChange={e => setNewVendorData({...newVendorData, address: e.target.value})}
                className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                placeholder="Vendor Office Address"
              />
            </div>
            
            <div className="pt-3 border-t border-zinc-800 space-y-3">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">Bank Settlement details (Optional)</span>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Bank Name</label>
                <Input 
                  value={newVendorData.bank_name}
                  onChange={e => setNewVendorData({...newVendorData, bank_name: e.target.value})}
                  className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                  placeholder="e.g. BCA, Mandiri"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500 font-medium uppercase">Account No</label>
                  <Input 
                    value={newVendorData.bank_account_no}
                    onChange={e => setNewVendorData({...newVendorData, bank_account_no: e.target.value})}
                    className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                    placeholder="xxxxxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500 font-medium uppercase">Account Name</label>
                  <Input 
                    value={newVendorData.bank_account_name}
                    onChange={e => setNewVendorData({...newVendorData, bank_account_name: e.target.value})}
                    className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                    placeholder="Beneficiary Name"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewVendorModalOpen(false)} className="border-zinc-800 bg-zinc-900 text-zinc-300">
              Cancel
            </Button>
            <Button onClick={handleCreateNewVendor} disabled={posting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {posting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Invoice Confirmation Dialog */}
      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Void / Unpost Invoice
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to void this invoice? This action will perform the following safe reversals:
            </AlertDialogDescription>
            <div className="mt-2 space-y-3">
              <ul className="list-disc pl-4 space-y-1 text-zinc-300 text-xs">
                <li>Reverse and delete the General Ledger journal entries.</li>
                <li>Remove and delete the associated stock batches from inventory.</li>
                <li>Delete the stock ledger quantity transactions.</li>
                <li>Revert the invoice status back to <strong className="text-zinc-200">Reviewed</strong> to unlock all fields for editing.</li>
              </ul>
              <p className="text-red-400 font-medium text-xs">
                Warning: This action will be blocked if any of the items have already been consumed.
              </p>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-800 text-zinc-300 hover:bg-zinc-800" disabled={voiding}>
              Cancel
            </AlertDialogCancel>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white font-semibold animate-in fade-in zoom-in"
              onClick={handleVoid}
              disabled={voiding}
            >
              {voiding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Void Invoice
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
