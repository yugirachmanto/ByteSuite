'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, CreditCard, Activity, FileText } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    totalOrgs: 0,
    totalUsers: 0,
    activeSubscriptions: 0,
    suspendedOrgs: 0,
    outstandingCount: 0,
    outstandingAmount: 0,
    totalRevenue: 0,
    registrationsChart: [] as any[],
    revenueChart: [] as any[],
    clientInvoicesChart: [] as any[],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const [orgsRes, usersRes, invoicesRes] = await Promise.all([
        fetch('/api/admin/organizations'),
        fetch('/api/admin/users'),
        fetch('/api/admin/invoices')
      ])

      const orgsData = await orgsRes.json()
      const usersData = await usersRes.json()
      const invoicesData = await invoicesRes.json()

      const orgs = orgsData.organizations || []
      const users = usersData.users || []
      const invoices = invoicesData.invoices || []

      const outstandingInvoices = invoices.filter((i: any) => ['pending', 'under_review', 'past_due'].includes(i.status))
      const paidInvoices = invoices.filter((i: any) => i.status === 'paid')

      // Processing chart data
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

      // Registrations by month
      const registrationsMap: Record<string, number> = {}
      orgs.forEach((o: any) => {
        const d = new Date(o.created_at)
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`
        registrationsMap[key] = (registrationsMap[key] || 0) + 1
      })
      const registrationsChart = Object.entries(registrationsMap).map(([month, count]) => ({ month, count }))

      // Revenue by month
      const revenueMap: Record<string, number> = {}
      paidInvoices.forEach((i: any) => {
        const d = new Date(i.created_at)
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`
        revenueMap[key] = (revenueMap[key] || 0) + Number(i.amount)
      })
      const revenueChart = Object.entries(revenueMap).map(([month, revenue]) => ({ month, revenue }))

      // Invoices per client
      const clientInvoicesMap: Record<string, number> = {}
      invoices.forEach((i: any) => {
        const orgName = i.organizations?.name || 'Unknown'
        clientInvoicesMap[orgName] = (clientInvoicesMap[orgName] || 0) + 1
      })
      const clientInvoicesChart = Object.entries(clientInvoicesMap)
        .map(([client, count]) => ({ client, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10) // Top 10 clients

      setStats({
        totalOrgs: orgs.length,
        totalUsers: users.length,
        activeSubscriptions: orgs.filter((o: any) => o.subscription_status === 'active').length,
        suspendedOrgs: orgs.filter((o: any) => !o.is_active).length,
        outstandingCount: outstandingInvoices.length,
        outstandingAmount: outstandingInvoices.reduce((sum: number, i: any) => sum + Number(i.amount), 0),
        totalRevenue: paidInvoices.reduce((sum: number, i: any) => sum + Number(i.amount), 0),
        registrationsChart,
        revenueChart,
        clientInvoicesChart,
      })
    } catch (error) {
      console.error('Failed to load stats', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Overview</h2>
        <p className="text-zinc-400">Welcome to the ByteSuite internal dashboard.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Row 1: Org & User Stats */}
        <Card className="bg-zinc-900 border-indigo-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{loading ? '-' : stats.totalOrgs}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900 border-indigo-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Users</CardTitle>
            <Users className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{loading ? '-' : stats.totalUsers}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-indigo-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Active Subscriptions</CardTitle>
            <CreditCard className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{loading ? '-' : stats.activeSubscriptions}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-indigo-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Suspended Orgs</CardTitle>
            <Activity className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{loading ? '-' : stats.suspendedOrgs}</div>
          </CardContent>
        </Card>

        {/* Row 2: Billing Stats */}
        <Card className="bg-zinc-900 border-indigo-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Outstanding Billings</CardTitle>
            <FileText className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{loading ? '-' : stats.outstandingCount}</div>
            <p className="text-xs text-zinc-500 mt-1">Pending or Under Review</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-indigo-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Unpaid Amount</CardTitle>
            <FileText className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{loading ? '-' : formatCurrency(stats.outstandingAmount)}</div>
            <p className="text-xs text-zinc-500 mt-1">Total value of outstanding billings</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-indigo-900/50 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Revenue (Paid)</CardTitle>
            <CreditCard className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{loading ? '-' : formatCurrency(stats.totalRevenue)}</div>
            <p className="text-xs text-zinc-500 mt-1">Total revenue collected from all tenants</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <Card className="bg-zinc-900 border-indigo-900/50">
          <CardHeader>
            <CardTitle className="text-zinc-100">Registrations by Month</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.registrationsChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                <XAxis dataKey="month" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#27272a' }} contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#f4f4f5' }} />
                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#6366f1', r: 4 }} name="New Accounts" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-indigo-900/50">
          <CardHeader>
            <CardTitle className="text-zinc-100">Revenue by Month</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.revenueChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                <XAxis dataKey="month" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis 
                  stroke="#a1a1aa" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => `Rp${val >= 1000 ? val/1000 + 'k' : val}`} 
                  width={60}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#f4f4f5' }} 
                  formatter={(value: any) => [formatCurrency(Number(value) || 0), 'Revenue']} 
                />
                <Line type="monotone" dataKey="revenue" stroke="#34d399" strokeWidth={3} dot={{ fill: '#34d399', r: 4 }} name="Revenue" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-indigo-900/50 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-zinc-100">Top Clients by Extracted Invoices</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.clientInvoicesChart} layout="vertical" margin={{ left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" horizontal={false} />
                <XAxis type="number" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis dataKey="client" type="category" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} width={100} />
                <Tooltip cursor={{ fill: '#27272a' }} contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#f4f4f5' }} />
                <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Invoices" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
