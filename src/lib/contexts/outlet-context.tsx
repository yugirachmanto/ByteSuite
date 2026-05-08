'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Outlet {
  id: string
  name: string
}

interface OutletContextType {
  selectedOutletId: string | null
  setSelectedOutletId: (id: string) => void
  outlets: Outlet[]
  loading: boolean
  reloadOutlets: () => void
}

const OutletContext = createContext<OutletContextType | undefined>(undefined)

export function OutletProvider({ children }: { children: React.ReactNode }) {
  const [selectedOutletId, setSelectedOutletId] = useState<string | null>(null)
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchOutlets = useCallback(async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('org_id, outlet_ids, role')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('[OutletContext] Failed to fetch profile:', profileError.message)
      setLoading(false)
      return
    }

    // Owners see ALL outlets in the org; other roles see only their assigned outlets
    let query = supabase.from('outlets').select('id, name').order('name')

    if (profile?.role === 'owner') {
      query = query.eq('org_id', profile.org_id)
    } else if (profile?.outlet_ids?.length > 0) {
      query = query.in('id', profile.outlet_ids)
    } else {
      // No outlets assigned and not an owner
      console.warn('[OutletContext] User has no outlet access.')
      setLoading(false)
      return
    }

    const { data: outletsData, error: outletError } = await query

    if (outletError) {
      console.error('[OutletContext] Failed to fetch outlets:', outletError.message)
    }

    if (outletsData && outletsData.length > 0) {
      setOutlets(outletsData)
      const saved = localStorage.getItem('selected_outlet_id')
      if (saved && outletsData.some(o => o.id === saved)) {
        setSelectedOutletId(saved)
      } else {
        setSelectedOutletId(outletsData[0].id)
      }
    } else {
      console.warn('[OutletContext] No outlets returned — check the outlets RLS policy.')
    }

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchOutlets()
  }, [fetchOutlets])

  const handleSetSelectedOutletId = (id: string) => {
    setSelectedOutletId(id)
    localStorage.setItem('selected_outlet_id', id)
  }

  return (
    <OutletContext.Provider value={{
      selectedOutletId,
      setSelectedOutletId: handleSetSelectedOutletId,
      outlets,
      loading,
      reloadOutlets: fetchOutlets,
    }}>
      {children}
    </OutletContext.Provider>
  )
}

export function useOutlet() {
  const context = useContext(OutletContext)
  if (context === undefined) {
    throw new Error('useOutlet must be used within an OutletProvider')
  }
  return context
}
