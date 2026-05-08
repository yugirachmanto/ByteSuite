'use client'

import { createContext, useContext, useState, useEffect } from 'react'
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
}

const OutletContext = createContext<OutletContextType | undefined>(undefined)

export function OutletProvider({ children }: { children: React.ReactNode }) {
  const [selectedOutletId, setSelectedOutletId] = useState<string | null>(null)
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchOutlets() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('outlet_ids')
        .eq('id', user.id)
        .single()

      if (profile?.outlet_ids?.length > 0) {
        const { data: outletsData } = await supabase
          .from('outlets')
          .select('id, name')
          .in('id', profile!.outlet_ids)

        if (outletsData) {
          setOutlets(outletsData)
          // Try to get from localStorage or default to first
          const saved = localStorage.getItem('selected_outlet_id')
          if (saved && outletsData.some(o => o.id === saved)) {
            setSelectedOutletId(saved)
          } else {
            setSelectedOutletId(outletsData[0].id)
          }
        }
      }
      setLoading(false)
    }

    fetchOutlets()
  }, [supabase])

  const handleSetSelectedOutletId = (id: string) => {
    setSelectedOutletId(id)
    localStorage.setItem('selected_outlet_id', id)
  }

  return (
    <OutletContext.Provider value={{ selectedOutletId, setSelectedOutletId: handleSetSelectedOutletId, outlets, loading }}>
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
