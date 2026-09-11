'use client'

import { OutletProvider } from '@/lib/contexts/outlet-context'

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <OutletProvider>
      <div className="min-h-screen bg-zinc-950">{children}</div>
    </OutletProvider>
  )
}
