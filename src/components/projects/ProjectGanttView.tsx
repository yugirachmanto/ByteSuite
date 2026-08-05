'use client'

import { useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Layers } from 'lucide-react'
import { Task } from './TaskDetailDrawer'

interface ProjectGanttViewProps {
  tasks: Task[]
  onSelectTask: (task: Task) => void
}

export function ProjectGanttView({ tasks, onSelectTask }: ProjectGanttViewProps) {
  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
        Belum ada task untuk ditampilkan di Gantt Chart timeline.
      </div>
    )
  }

  // Calculate timeline start and end dates
  const dates = tasks
    .map(t => t.due_date ? new Date(t.due_date).getTime() : new Date(t.created_at).getTime())
  
  const minTime = Math.min(...dates, Date.now()) - 2 * 24 * 60 * 60 * 1000
  const maxTime = Math.max(...dates, Date.now()) + 10 * 24 * 60 * 60 * 1000
  const totalDays = Math.ceil((maxTime - minTime) / (1000 * 60 * 60 * 24))

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 sm:p-6 overflow-x-auto space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-400" />
          Gantt Chart Timeline ({tasks.length} Tasks)
        </h3>
      </div>

      <div className="min-w-[700px] border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
        {/* Timeline Header Row */}
        <div className="grid grid-cols-12 bg-zinc-900/80 border-b border-zinc-800 py-2.5 px-4 text-xs font-semibold text-zinc-400">
          <div className="col-span-4">Task Name & Number</div>
          <div className="col-span-2">Priority</div>
          <div className="col-span-6 text-right pr-4">Timeline / Progress Bar</div>
        </div>

        {/* Task Rows */}
        <div className="divide-y divide-zinc-800/60">
          {tasks.map((task) => {
            const startDate = task.start_date ? new Date(task.start_date).getTime() : new Date(task.created_at).getTime()
            const dueDate = task.due_date ? new Date(task.due_date).getTime() : startDate + 3 * 24 * 60 * 60 * 1000

            const offsetDays = Math.max(0, Math.ceil((startDate - minTime) / (1000 * 60 * 60 * 24)))
            const durationDays = Math.max(1, Math.ceil((dueDate - startDate) / (1000 * 60 * 60 * 24)))

            const offsetPercent = Math.min(80, (offsetDays / totalDays) * 100)
            const widthPercent = Math.min(100 - offsetPercent, Math.max(15, (durationDays / totalDays) * 100))

            return (
              <div 
                key={task.id}
                onClick={() => onSelectTask(task)}
                className="grid grid-cols-12 items-center py-3 px-4 text-xs hover:bg-zinc-900/60 cursor-pointer transition-colors"
              >
                <div className="col-span-4 flex items-center gap-2 pr-2 truncate">
                  <span className="font-mono text-[10px] bg-zinc-800 text-indigo-300 px-1.5 py-0.5 rounded shrink-0">
                    {task.task_number}
                  </span>
                  <span className="text-zinc-200 font-medium truncate">{task.title}</span>
                </div>

                <div className="col-span-2">
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                    task.priority === 'urgent' ? 'bg-rose-500/10 text-rose-400' :
                    task.priority === 'high' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {task.priority}
                  </span>
                </div>

                {/* Timeline Bar Cell */}
                <div className="col-span-6 relative h-6 bg-zinc-900/50 rounded-lg overflow-hidden border border-zinc-800/40">
                  <div
                    className="absolute top-1 bottom-1 rounded-md bg-indigo-600/80 border border-indigo-400/30 flex items-center justify-between px-2 text-[10px] text-white font-mono shadow-xs"
                    style={{ left: `${offsetPercent}%`, width: `${widthPercent}%` }}
                  >
                    <span className="truncate pr-1">{task.progress_percent}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
