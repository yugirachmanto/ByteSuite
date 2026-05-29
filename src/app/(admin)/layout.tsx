'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  Users,
  LogOut,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react'

const adminSidebarGroups = [
  {
    name: 'Admin Dashboard',
    items: [
      { name: 'Overview', href: '/admin', icon: LayoutDashboard },
    ]
  },
  {
    name: 'Management',
    items: [
      { name: 'Organizations', href: '/admin/organizations', icon: Building2 },
      { name: 'Global Users', href: '/admin/users', icon: Users },
    ]
  }
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSuperadmin, setIsSuperadmin] = useState<boolean | null>(null)

  useEffect(() => {
    checkAdmin()
  }, [])

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_superadmin')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.is_superadmin) {
      router.push('/dashboard')
    } else {
      setIsSuperadmin(true)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (isSuperadmin === null) {
    return <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-500">Verifying admin access...</div>
  }

  return (
    <div className="flex h-screen bg-zinc-950">
      {/* Admin Sidebar with distinct purple/indigo accent */}
      <aside
        className={cn(
          'flex flex-col border-r border-indigo-900/50 bg-zinc-950/80 transition-all duration-300',
          isSidebarOpen ? 'w-64' : 'w-20'
        )}
      >
        <div className="flex h-16 items-center px-6 border-b border-indigo-900/50 bg-indigo-950/20">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <ShieldAlert className="h-4 w-4" />
            </div>
            {isSidebarOpen && (
              <span className="text-xl font-bold tracking-tight text-zinc-100">BS Admin</span>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 px-4 py-6">
          <nav className="space-y-6">
            {adminSidebarGroups.map((group) => (
              <div key={group.name} className="space-y-2">
                {isSidebarOpen && (
                  <h3 className="px-3 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                    {group.name}
                  </h3>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-indigo-900/50 text-indigo-200 border border-indigo-800/50'
                            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
                          !isSidebarOpen && 'justify-center'
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        {isSidebarOpen && <span>{item.name}</span>}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        <div className="p-4 space-y-2 bg-indigo-950/10">
          <Separator className="mb-4 bg-indigo-900/30" />
          <Button
            variant="ghost"
            onClick={handleLogout}
            className={cn(
              'w-full justify-start gap-3 text-zinc-400 hover:bg-red-950/20 hover:text-red-400',
              !isSidebarOpen && 'justify-center'
            )}
          >
            <LogOut className="h-5 w-5" />
            {isSidebarOpen && <span>Logout</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex h-16 items-center border-b border-zinc-800 bg-zinc-900/30 px-8 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="text-zinc-400 hover:text-zinc-100"
          >
            <ChevronRight
              className={cn('h-5 w-5 transition-transform', isSidebarOpen ? 'rotate-180' : 'rotate-0')}
            />
          </Button>
          <div className="ml-4 h-4 w-[1px] bg-zinc-800" />
          <h1 className="ml-6 text-sm font-medium text-indigo-300">
            Internal Admin Panel
          </h1>
        </header>
        <div className="flex-1 overflow-auto bg-zinc-950 p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </div>
      </main>
    </div>
  )
}
