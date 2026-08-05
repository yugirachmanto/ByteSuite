'use client'

import { useState } from 'react'
import { Plus, Clock, AlertCircle, CheckCircle2, MessageSquare, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Task } from './TaskDetailDrawer'

interface TaskKanbanBoardProps {
  tasks: Task[]
  onSelectTask: (task: Task) => void
  onQuickCreateTask: (status: Task['status']) => void
}

const COLUMNS: { id: Task['status']; label: string; color: string }[] = [
  { id: 'todo', label: 'To Do', color: 'border-zinc-700 text-zinc-400 bg-zinc-800/40' },
  { id: 'in_progress', label: 'In Progress', color: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' },
  { id: 'in_review', label: 'In Review', color: 'border-amber-500/30 text-amber-400 bg-amber-500/10' },
  { id: 'blocked', label: 'Blocked', color: 'border-rose-500/30 text-rose-400 bg-rose-500/10' },
  { id: 'done', label: 'Done', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
]

export function TaskKanbanBoard({ tasks, onSelectTask, onQuickCreateTask }: TaskKanbanBoardProps) {
  return (
    <div className="flex gap-3 w-full">
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter((t) => t.status === column.id)

        return (
          <div 
            key={column.id}
            className="flex flex-col bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-3 flex-1 min-w-0 max-h-[750px]"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between p-2 mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${column.color}`}>
                  {column.label}
                </span>
                <span className="text-xs font-mono text-zinc-500">({columnTasks.length})</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onQuickCreateTask(column.id)}
                className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Task Cards Container */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {columnTasks.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-zinc-800/60 rounded-xl text-[11px] text-zinc-600">
                  Tidak ada task
                </div>
              ) : (
                columnTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="group bg-zinc-900 hover:bg-zinc-850 border border-zinc-800/90 hover:border-indigo-500/40 rounded-xl p-3.5 cursor-pointer transition-all duration-150 space-y-3 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-mono text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-800">
                        {task.task_number}
                      </span>
                      <span className={`font-semibold uppercase px-1.5 py-0.5 rounded ${
                        task.priority === 'urgent' ? 'bg-rose-500/20 text-rose-400' :
                        task.priority === 'high' ? 'bg-amber-500/20 text-amber-400' :
                        'text-zinc-400'
                      }`}>
                        {task.priority}
                      </span>
                    </div>

                    <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-300 transition-colors line-clamp-2">
                      {task.title}
                    </h4>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500">
                        <span>Progress</span>
                        <span className="font-mono">{task.progress_percent}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 transition-all duration-300"
                          style={{ width: `${task.progress_percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
                      {task.due_date ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-zinc-400" />
                          {new Date(task.due_date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}
                        </span>
                      ) : (
                        <span>No deadline</span>
                      )}

                      {task.approval_status !== 'not_required' && (
                        <span className="text-amber-400 font-semibold uppercase">
                          Approval: {task.approval_status}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
