'use client'

import { useOutlet } from '@/lib/contexts/outlet-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  FileText, 
  Package, 
  TrendingUp, 
  AlertCircle 
} from 'lucide-react'

export default function DashboardPage() {
  const { selectedOutletId, outlets } = useOutlet()
  const selectedOutlet = outlets.find(o => o.id === selectedOutletId)

  const stats = [
    { name: 'Total Invoices', value: '0', icon: FileText, color: 'text-blue-400' },
    { name: 'Inventory Value', value: 'Rp 0', icon: Package, color: 'text-emerald-400' },
    { name: 'Monthly Revenue', value: 'Rp 0', icon: TrendingUp, color: 'text-purple-400' },
    { name: 'Low Stock Items', value: '0', icon: AlertCircle, color: 'text-amber-400' },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
          Hello, welcome back!
        </h2>
        <p className="text-zinc-400">
          Here's what's happening at <span className="font-medium text-zinc-200">{selectedOutlet?.name || 'your outlet'}</span> today.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name} className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                {stat.name}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-100">{stat.value}</div>
              <p className="text-xs text-zinc-500">+0% from last month</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-zinc-100">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-[200px] items-center justify-center text-zinc-500">
              No recent activity to show.
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3 border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-zinc-100">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <div className="flex-1 text-sm text-zinc-300">Database Connection</div>
                <div className="text-xs text-emerald-500 font-medium">Online</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <div className="flex-1 text-sm text-zinc-300">Storage Service</div>
                <div className="text-xs text-emerald-500 font-medium">Online</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <div className="flex-1 text-sm text-zinc-300">AI Extraction Engine</div>
                <div className="text-xs text-emerald-500 font-medium">Ready</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
