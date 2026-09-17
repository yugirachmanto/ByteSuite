'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Package,
  Hammer,
  ClipboardList,
  BarChart3,
  Settings,
  Share2,
  ChevronRight,
  Menu,
  LogOut,
  Building2,
  Check,
  User,
  Wallet,
  BookOpen,
  CreditCard,
  Tag,
  HelpCircle,
  FolderKanban,
  ClipboardCheck,
  ShoppingCart,
  PackageCheck,
  Users,
  Trash2,
  Workflow,
  History,
  TrendingUp,
  ShieldAlert
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useOutlet, OutletProvider } from '@/lib/contexts/outlet-context'
import { useLanguage } from '@/lib/contexts/language-context'
import { DateWindowProvider } from '@/lib/contexts/date-window-context'
import { DateWindowPicker } from '@/components/date-window-picker'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChatWidget } from '@/components/chat/ChatWidget'

const sidebarGroups = [
  {
    // Cashiers land on /pos, not this financial dashboard (invoices, AP,
    // inventory value) — excluded here rather than shown a stripped-down
    // version, matching the redirect in dashboard/page.tsx.
    name: 'Main',
    roles: ['owner', 'admin', 'finance', 'kitchen', 'viewer'],
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ]
  },
  {
    name: 'Kasir',
    roles: ['owner', 'admin', 'cashier', 'finance', 'viewer'],
    items: [
      { name: 'Point of Sale', href: '/pos', icon: CreditCard, roles: ['owner', 'admin', 'cashier'] },
      { name: 'Riwayat Shift', href: '/pos/shift-history', icon: History },
      { name: 'Penjualan POS', href: '/pos/sales-report', icon: TrendingUp },
    ]
  },
  {
    name: 'Finance & Procurement',
    roles: ['owner', 'admin', 'finance', 'viewer'],
    items: [
      { name: 'Requisitions', href: '/purchasing/pr', icon: ClipboardCheck },
      { name: 'Purchase Orders', href: '/purchasing/po', icon: ShoppingCart },
      { name: 'Pipeline', href: '/purchasing/pipeline', icon: Workflow },
      { name: 'Goods Receipt', href: '/purchasing/gr', icon: PackageCheck },
      { name: 'Invoices', href: '/invoices', icon: FileText },
      { name: 'Vendors', href: '/vendors', icon: Building2 },
      { name: 'Customers', href: '/customers', icon: Users },
      { name: 'Accounting', href: '/accounting', icon: BookOpen },
      { name: 'Reports', href: '/reports', icon: BarChart3 },
    ]
  },
  {
    name: 'Projects & Tasks',
    roles: ['owner', 'admin', 'finance', 'kitchen', 'viewer'],
    items: [
      { name: 'Projects', href: '/projects', icon: FolderKanban },
    ]
  },
  {
    name: 'Operations',
    roles: ['owner', 'admin', 'kitchen', 'finance', 'viewer'],
    items: [
      { name: 'Inventory', href: '/inventory', icon: Package },
      { name: 'Products', href: '/products', icon: Tag },
      { name: 'Production', href: '/production', icon: Hammer },
      { name: 'Opname', href: '/opname', icon: ClipboardList },
      { name: 'Waste', href: '/waste', icon: Trash2 },
    ]
  },
  {
    name: 'Administration',
    roles: ['owner', 'admin'],
    items: [
      { name: 'Integrations', href: '/integrations', icon: Share2 },
      { name: 'Billing', href: '/billing', icon: CreditCard },
      { name: 'Settings', href: '/settings', icon: Settings },
    ]
  }
]

// Only the purchasing nav items are translated so far (rest of the sidebar
// is out of scope for this phase of the i18n rollout — see language-context.tsx).
const SIDEBAR_LABEL_KEYS: Record<string, string> = {
  '/purchasing/pr': 'purchasing.sidebar.requisitions',
  '/purchasing/po': 'purchasing.sidebar.purchaseOrders',
  '/purchasing/gr': 'purchasing.sidebar.goodsReceipt',
}

// Route-level access control — the sidebar above only decides what's *shown*
// in the nav; without this, a role could still open a restricted page by
// typing its URL directly (e.g. a cashier browsing straight to /accounting).
// Ordered so a more specific rule (checked first, `exact: true`) can carve
// out a narrower allowance than its own broader prefix (e.g. the POS
// terminal itself is cashier-only, but /pos/sales-report and /pos/receipt/*
// under the same prefix are also open to finance/viewer).
const ROUTE_ACCESS: { prefix: string; exact?: boolean; roles: string[] }[] = [
  { prefix: '/dashboard', roles: ['owner', 'admin', 'finance', 'kitchen', 'viewer'] },
  { prefix: '/pos', exact: true, roles: ['owner', 'admin', 'cashier'] },
  { prefix: '/pos', roles: ['owner', 'admin', 'cashier', 'finance', 'viewer'] },
  { prefix: '/purchasing', roles: ['owner', 'admin', 'finance', 'viewer'] },
  { prefix: '/invoices', roles: ['owner', 'admin', 'finance', 'viewer'] },
  { prefix: '/vendors', roles: ['owner', 'admin', 'finance', 'viewer'] },
  { prefix: '/customers', roles: ['owner', 'admin', 'finance', 'viewer'] },
  { prefix: '/accounting', roles: ['owner', 'admin', 'finance', 'viewer'] },
  { prefix: '/reports', roles: ['owner', 'admin', 'finance', 'viewer'] },
  { prefix: '/projects', roles: ['owner', 'admin', 'finance', 'kitchen', 'viewer'] },
  { prefix: '/inventory', roles: ['owner', 'admin', 'kitchen', 'finance', 'viewer'] },
  { prefix: '/products', roles: ['owner', 'admin', 'kitchen', 'finance', 'viewer'] },
  { prefix: '/production', roles: ['owner', 'admin', 'kitchen', 'finance', 'viewer'] },
  { prefix: '/opname', roles: ['owner', 'admin', 'kitchen', 'finance', 'viewer'] },
  { prefix: '/waste', roles: ['owner', 'admin', 'kitchen', 'finance', 'viewer'] },
  { prefix: '/recipes', roles: ['owner', 'admin', 'kitchen', 'finance', 'viewer'] },
  { prefix: '/integrations', roles: ['owner', 'admin'] },
  { prefix: '/billing', roles: ['owner', 'admin'] },
  { prefix: '/settings', roles: ['owner', 'admin'] },
]

function getAllowedRoles(pathname: string): string[] | null {
  const exactMatch = ROUTE_ACCESS.find(r => r.exact && pathname === r.prefix)
  if (exactMatch) return exactMatch.roles
  const prefixMatch = ROUTE_ACCESS.find(r => !r.exact && (pathname === r.prefix || pathname.startsWith(r.prefix + '/')))
  return prefixMatch ? prefixMatch.roles : null
}

// A suspended org can still reach these — otherwise an owner locked out by
// their own unpaid bill would have no way to see or pay it and get
// reactivated. /profile stays open too (logout, account info).
const SUSPENSION_EXEMPT_PREFIXES = ['/billing', '/profile']

function isSuspensionExempt(pathname: string): boolean {
  return SUSPENSION_EXEMPT_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function SuspendedBlock() {
  return (
    <div className="rounded-xl border border-red-900/30 bg-red-950/10 backdrop-blur-sm p-8 text-center max-w-2xl mx-auto my-12">
      <div className="mx-auto h-14 w-14 rounded-full bg-red-950/40 border border-red-900/50 flex items-center justify-center text-red-500 mb-4">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h3 className="text-xl font-bold tracking-tight text-red-400 mb-2">Access Suspended</h3>
      <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
        This organization's access to ByteSuite has been suspended, usually due to an outstanding bill.
        Visit Billing to review and settle any outstanding invoices, or contact support if you believe this is a mistake.
      </p>
      <div className="flex justify-center gap-3">
        <Link href="/billing">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            Go to Billing
          </Button>
        </Link>
      </div>
    </div>
  )
}

// ── Inner shell (consumes OutletProvider context) ────────────────────────────
function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { selectedOutletId, setSelectedOutletId, userRole, outlets, posEnabled, orgSuspended, loading: outletLoading } = useOutlet()
  const { t } = useLanguage()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [hasOutstandingBilling, setHasOutstandingBilling] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false)
    }
  }, [])

  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false)
    }
  }, [pathname])

  const routeAllowedRoles = pathname ? getAllowedRoles(pathname) : null
  const roleResolved = !outletLoading && !!userRole
  // Unrestricted routes (no entry in ROUTE_ACCESS, e.g. /profile) always
  // render immediately. Restricted ones wait for the role to resolve before
  // rendering at all, so a disallowed role never sees a flash of the page
  // before the redirect below kicks in.
  const isAuthorized = !routeAllowedRoles || (roleResolved && routeAllowedRoles.includes(userRole!))

  // Org suspension (set via /admin) — previously a cosmetic badge only; this
  // is what actually cuts off access. Checked after role resolution so it
  // doesn't flash the real dashboard before blocking.
  const isSuspendedAndBlocked = !outletLoading && orgSuspended && !!pathname && !isSuspensionExempt(pathname)

  useEffect(() => {
    if (!roleResolved || !routeAllowedRoles) return
    if (!routeAllowedRoles.includes(userRole!)) {
      router.replace(userRole === 'cashier' ? '/pos' : '/dashboard')
    }
  }, [pathname, userRole, roleResolved, routeAllowedRoles, router])

  useEffect(() => {
    async function checkBilling() {
      if (userRole === 'owner') {
        const { data } = await supabase
          .from('tenant_invoices')
          .select('id')
          .in('status', ['pending', 'past_due', 'under_review'])
          .limit(1)
          
        if (data && data.length > 0) {
          setHasOutstandingBilling(true)
        }
      }
    }
    if (mounted && userRole === 'owner') {
      checkBilling()
    }
  }, [mounted, userRole, supabase])

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen bg-zinc-950 print:bg-white print:h-auto print:block">
      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col overflow-hidden border-r border-zinc-800 bg-zinc-900 transition-all duration-300 print:hidden z-50',
          'fixed inset-y-0 left-0 md:relative',
          isSidebarOpen ? 'w-64 translate-x-0' : 'w-20 -translate-x-full md:translate-x-0'
        )}
      >
        <div className="flex h-16 items-center px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900">
              <span className="text-xl font-bold italic">B</span>
            </div>
            {isSidebarOpen && (
              <span className="text-xl font-bold tracking-tight text-zinc-100">ByteSuite</span>
            )}
          </div>
        </div>

        <div className="px-4 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'w-full justify-start gap-3 border-zinc-800 bg-zinc-950 px-3 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-100',
                !isSidebarOpen && 'px-0 justify-center'
              )}
            >
              <Building2 className="h-4 w-4" />
              {isSidebarOpen && (
                <>
                  <span className="flex-1 truncate text-left">
                    {outletLoading ? 'Loading...' : selectedOutlet?.name || 'Select Outlet'}
                  </span>
                  <ChevronRight className="h-3 w-3 rotate-90 text-zinc-500" />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56 border-zinc-800 bg-zinc-900 text-zinc-100"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel>Switch Outlet</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-800" />
                {outlets.map((outlet) => (
                  <DropdownMenuItem
                    key={outlet.id}
                    onClick={() => setSelectedOutletId(outlet.id)}
                    className="flex items-center justify-between focus:bg-zinc-800 focus:text-zinc-100"
                  >
                    {outlet.name}
                    {selectedOutletId === outlet.id && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ScrollArea className="flex-1 min-h-0 px-4 py-2">
          <nav className="space-y-4">
            {sidebarGroups
              .filter(group => !userRole || group.roles.includes(userRole))
              .map((group) => (
                <div key={group.name} className="space-y-1">
                  {isSidebarOpen && (
                    <h3 className="px-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                      {group.name}
                    </h3>
                  )}
                  <div className="space-y-0.5">
                    {mounted && group.items.map((item) => {
                      if (!posEnabled && item.name === 'Point of Sale') return null;
                      if ((item as any).roles && userRole && !(item as any).roles.includes(userRole)) return null;
                      const isActive =
                        pathname === item.href ||
                        (item.href !== '/dashboard' && pathname?.startsWith(item.href))
                      return (
                          <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors relative',
                              isActive
                                ? 'bg-zinc-800 text-zinc-100'
                                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100',
                              !isSidebarOpen && 'justify-center'
                            )}
                          >
                            <item.icon className="h-5 w-5" />
                            {isSidebarOpen && <span>{SIDEBAR_LABEL_KEYS[item.href] ? t(SIDEBAR_LABEL_KEYS[item.href]) : item.name}</span>}
                            {item.name === 'Billing' && hasOutstandingBilling && (
                              <span className={cn(
                                "absolute h-2 w-2 rounded-full bg-yellow-500",
                                isSidebarOpen ? "right-3 top-1/2 -translate-y-1/2" : "right-1 top-1"
                              )} />
                            )}
                          </Link>
                      )
                    })}
                    {!mounted && <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-800/50" />}
                  </div>
                </div>
              ))}
          </nav>
        </ScrollArea>

        <div className="p-3 space-y-1">
          <Separator className="mb-2 bg-zinc-800" />
          <Link href="/profile">
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start gap-3 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100',
                !isSidebarOpen && 'justify-center'
              )}
            >
              <User className="h-5 w-5" />
              {isSidebarOpen && <span>Profile</span>}
            </Button>
          </Link>
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
      <main className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:block">
        <header className="flex h-16 items-center border-b border-zinc-800 bg-zinc-900/50 px-4 md:px-8 backdrop-blur-sm print:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="text-zinc-400 hover:text-zinc-100 hidden md:flex"
          >
            <ChevronRight
              className={cn('h-5 w-5 transition-transform', isSidebarOpen ? 'rotate-180' : 'rotate-0')}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="text-zinc-400 hover:text-zinc-100 flex md:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="ml-4 h-4 w-[1px] bg-zinc-800 hidden md:block" />
          <h1 className="ml-6 text-sm font-medium text-zinc-400">
            {sidebarGroups
              .flatMap(g => g.items)
              .find((i) => pathname === i.href || (i.href !== '/dashboard' && pathname?.startsWith(i.href)))
              ?.name || 'Dashboard'}
          </h1>
          <div className="ml-auto flex items-center gap-2 pr-4 print:hidden">
            <DateWindowPicker />
            <Link href="/sop">
              <Button
                variant="ghost"
                size="icon"
                title="SOP & Panduan"
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 ml-2"
              >
                <HelpCircle className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </header>
        <div className="flex-1 overflow-auto bg-zinc-950 p-4 md:p-8 print:bg-white print:p-0 print:overflow-visible">
          <div className="mx-auto max-w-7xl print:max-w-none">
            {isSuspendedAndBlocked ? <SuspendedBlock /> : (isAuthorized ? children : null)}
          </div>
        </div>
      </main>
    </div>
  )
}

// ── Outer layout: provides the context, then renders the shell ───────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <OutletProvider>
      <DateWindowProvider>
        <DashboardShell>{children}</DashboardShell>
        <div className="print:hidden"><ChatWidget /></div>
      </DateWindowProvider>
    </OutletProvider>
  )
}
