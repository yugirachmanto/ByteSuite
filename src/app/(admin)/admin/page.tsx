'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, CreditCard, Activity } from 'lucide-react'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    totalOrgs: 0,
    totalUsers: 0,
    activeSubscriptions: 0,
    suspendedOrgs: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const [orgsRes, usersRes] = await Promise.all([
        fetch('/api/admin/organizations'),
        fetch('/api/admin/users')
      ])

      const orgsData = await orgsRes.json()
      const usersData = await usersRes.json()

      const orgs = orgsData.organizations || []
      const users = usersData.users || []

      setStats({
        totalOrgs: orgs.length,
        totalUsers: users.length,
        activeSubscriptions: orgs.filter((o: any) => o.subscription_status === 'active').length,
        suspendedOrgs: orgs.filter((o: any) => !o.is_active).length,
      })
    } catch (error) {
      console.error('Failed to load stats', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Overview</h2>
        <p className="text-zinc-400">Welcome to the ByteSuite internal dashboard.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
      </div>
    </div>
  )
}
