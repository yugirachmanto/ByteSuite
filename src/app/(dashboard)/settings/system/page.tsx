'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, ShieldAlert, Trash2, CheckCircle2, XCircle } from 'lucide-react'

export default function SystemResetPage() {
  const supabase = createClient()
  const router = useRouter()
  
  const [loading, setLoading] = useState(true)
  const [wiping, setWiping] = useState(false)
  const [userProfile, setUserProfile] = useState<{ org_id: string; role: string } | null>(null)
  const [confirmText, setConfirmText] = useState('')
  
  useEffect(() => {
    async function checkRole() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Authentication required.')
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id, role')
        .eq('id', user.id)
        .single()
      
      if (profile) {
        setUserProfile(profile)
      }
      setLoading(false)
    }
    checkRole()
  }, [supabase, router])

  const handleWipeData = async () => {
    if (!userProfile || userProfile.role !== 'owner') {
      toast.error('Unauthorized access.')
      return
    }

    if (confirmText !== 'WIPE DATA') {
      toast.error('Please type WIPE DATA exactly to confirm.')
      return
    }

    setWiping(true)
    const toastId = toast.loading('Initiating system reset... Wiping all organization data.')

    try {
      const { error } = await supabase.rpc('wipe_organization_data', {
        p_org_id: userProfile.org_id
      })

      if (error) {
        toast.error(error.message || 'System reset failed.', { id: toastId })
        setWiping(false)
        return
      }

      toast.success('System reset completed successfully! Re-routing you now.', { id: toastId })
      
      // Delay slightly and reload dashboard to a fresh state
      setTimeout(() => {
        window.location.href = '/settings'
      }, 1500)

    } catch (err: any) {
      toast.error(err.message || 'An unexpected error occurred during system reset.', { id: toastId })
      setWiping(false)
    }
  }

  // 1. Loading State
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-zinc-500">
        <Loader2 className="h-8 w-8 animate-spin mb-3 text-zinc-400" />
        <p className="text-sm">Verifying security clearances...</p>
      </div>
    )
  }

  // 2. Access Denied (Non-owner user)
  if (!userProfile || userProfile.role !== 'owner') {
    return (
      <div className="rounded-xl border border-red-900/30 bg-red-950/10 backdrop-blur-sm p-8 text-center max-w-2xl mx-auto my-12">
        <div className="mx-auto h-14 w-14 rounded-full bg-red-950/40 border border-red-900/50 flex items-center justify-center text-red-500 mb-4 animate-pulse">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-bold tracking-tight text-red-400 mb-2">Access Restrained</h3>
        <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
          The **System Reset** utility is exclusively restricted to the organization **Owner**. 
          Standard profiles (Finance, Cashier, Kitchen, and Viewer) are not permitted to perform data wipes.
        </p>
        <div className="flex justify-center gap-3">
          <Button 
            variant="outline" 
            className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            onClick={() => router.push('/settings')}
          >
            Return to Settings
          </Button>
        </div>
      </div>
    )
  }

  // 3. Normal Form UI (Owner user)
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="rounded-xl border border-red-900/30 bg-red-950/10 backdrop-blur-sm p-6 flex gap-4 items-start">
        <div className="p-2 rounded-lg bg-red-950/40 border border-red-900/50 text-red-500 shrink-0">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-red-400">Danger Zone: System Reset</h3>
          <p className="text-sm text-zinc-400 leading-relaxed mt-1">
            This operation is permanent and **cannot be undone**. Wiping the data will reset this organization's database to a clean, fresh setup.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* What gets deleted */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm uppercase tracking-wider">
            <Trash2 className="h-4 w-4" />
            Items to be Deleted
          </div>
          <ul className="space-y-2.5 text-sm text-zinc-300">
            <li className="flex items-start gap-2.5">
              <XCircle className="h-4 w-4 text-red-500/80 shrink-0 mt-0.5" />
              <span>**General Ledger Entries**: Wipes the entire historical bookkeeping ledgers and balance journals.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <XCircle className="h-4 w-4 text-red-500/80 shrink-0 mt-0.5" />
              <span>**Purchase Invoices**: Wipes all uploaded/extracted invoices, line item breakdowns, and AP logs.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <XCircle className="h-4 w-4 text-red-500/80 shrink-0 mt-0.5" />
              <span>**Accounts Payable History**: Deletes payment records and unpaid debt schedules.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <XCircle className="h-4 w-4 text-red-500/80 shrink-0 mt-0.5" />
              <span>**Inventory Log & Batches**: Resets all inventory hand counts, FIFO stock batches, and logs.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <XCircle className="h-4 w-4 text-red-500/80 shrink-0 mt-0.5" />
              <span>**Catalog Setup**: Clears out your Item Master, Bill of Materials (BOM), and custom pricing lists.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <XCircle className="h-4 w-4 text-red-500/80 shrink-0 mt-0.5" />
              <span>**Account mappings**: Removes customized closing accounts and Tax/PPN/Freight mapping rules.</span>
            </li>
          </ul>
        </div>

        {/* What is preserved */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider">
            <CheckCircle2 className="h-4 w-4" />
            Entities to be Preserved
          </div>
          <ul className="space-y-2.5 text-sm text-zinc-300">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500/80 shrink-0 mt-0.5" />
              <span>**Your Profile**: Keeps your active email, password, and owner permissions intact.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500/80 shrink-0 mt-0.5" />
              <span>**Users / Access Roles**: Retains access credentials for other members in your company.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500/80 shrink-0 mt-0.5" />
              <span>**Outlet Data**: Keeps your registered outlets and geographic setups completely safe.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500/80 shrink-0 mt-0.5" />
              <span>**Organization Metadata**: Retains your business name, primary tenant key, and metadata.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Double confirmation area */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <h4 className="text-zinc-100 font-semibold text-sm">Please confirm your intent to continue</h4>
        <p className="text-xs text-zinc-400">
          To verify that you wish to wipe all company database transactions and master catalog setups, 
          please type the confirmation string <code className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded font-mono font-bold select-none text-xs">WIPE DATA</code> in the input field below.
        </p>

        <div className="space-y-2 max-w-md">
          <Label htmlFor="confirm-reset" className="text-xs text-zinc-400">Confirmation Box</Label>
          <Input 
            id="confirm-reset"
            placeholder="Type WIPE DATA here"
            className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-red-950 focus-visible:border-red-900 font-mono tracking-wider"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={wiping}
          />
        </div>

        <div className="pt-2">
          <Button 
            disabled={confirmText !== 'WIPE DATA' || wiping}
            className={`w-full md:w-auto font-semibold shadow-lg transition-all duration-300 shrink-0 flex items-center justify-center ${
              confirmText === 'WIPE DATA' && !wiping
                ? 'bg-red-600 hover:bg-red-500 hover:shadow-red-900/30 text-white scale-[1.01]' 
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
            onClick={handleWipeData}
          >
            {wiping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wiping System Data...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Confirm Reset & Wipe Organization Data
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
