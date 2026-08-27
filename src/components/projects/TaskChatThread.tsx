'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface Comment {
  id: string
  task_id: string
  author_id: string | null
  author_type: 'user' | 'ai'
  message: string
  created_at: string
}

interface TaskChatThreadProps {
  taskId: string
  taskTitle: string
}

export function TaskChatThread({ taskId, taskTitle }: TaskChatThreadProps) {
  const supabase = createClient()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('pm_task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Fetch comments error:', error.message)
    } else {
      setComments(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchComments()

    // Supabase Realtime subscription
    const channel = supabase
      .channel(`pm_task_comments:${taskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pm_task_comments', filter: `task_id=eq.${taskId}` },
        (payload) => {
          setComments((prev) => [...prev, payload.new as Comment])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [taskId])

  useEffect(() => {
    scrollToBottom()
  }, [comments])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMessage.trim() || sending) return

    const msgText = inputMessage.trim()
    setInputMessage('')
    setSending(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('Cannot send message: no authenticated user')
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

      if (!profile?.org_id) {
        console.error('Cannot send message: no organization found for user')
        return
      }

      // 1. Insert user message
      const { error } = await supabase
        .from('pm_task_comments')
        .insert({
          org_id: profile.org_id,
          task_id: taskId,
          author_id: user.id,
          author_type: 'user',
          message: msgText
        })

      if (error) {
        console.error('Error posting comment:', error.message)
      }

      // 2. If message mentions @AI or starts with /ai, trigger AI response route
      if (msgText.toLowerCase().includes('@ai') || msgText.toLowerCase().startsWith('/ai')) {
        try {
          await fetch('/api/projects/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId,
              userMessage: msgText,
              orgId: profile.org_id
            })
          })
        } catch (err) {
          console.error('AI chat trigger failed:', err)
        }
      }
    } finally {
      setSending(false)
    }
  }

  const triggerAiHelp = async () => {
    if (sending) return
    setSending(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('Cannot trigger AI help: no authenticated user')
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

      if (!profile?.org_id) {
        console.error('Cannot trigger AI help: no organization found for user')
        return
      }

      await fetch('/api/projects/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          userMessage: '@AI Mohon berikan saran perbaikan atau ringkasan status task ini.',
          orgId: profile.org_id
        })
      })
    } catch (err) {
      console.error('AI trigger failed:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-[450px] bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Thread Header */}
      <div className="p-3.5 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
          Diskusi & Catatan Task
        </span>
        <button 
          onClick={triggerAiHelp}
          disabled={sending}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-2.5 py-1 rounded-lg transition-colors"
        >
          <Sparkles className="h-3 w-3" />
          Tanya AI
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {loading ? (
          <div className="text-center text-xs text-zinc-500 py-8">Loading diskusi...</div>
        ) : comments.length === 0 ? (
          <div className="text-center text-xs text-zinc-500 py-12 space-y-1">
            <p>Belum ada diskusi untuk task ini.</p>
            <p className="text-zinc-600">Ketik pesan di bawah atau sebut <span className="text-indigo-400 font-mono">@AI</span> untuk bantuan.</p>
          </div>
        ) : (
          comments.map((comment) => {
            const isAi = comment.author_type === 'ai'
            return (
              <div 
                key={comment.id}
                className={`flex gap-2.5 ${isAi ? 'bg-indigo-950/20 border border-indigo-500/20 p-3 rounded-xl' : 'items-start'}`}
              >
                <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold ${
                  isAi ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {isAi ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>

                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${isAi ? 'text-indigo-300' : 'text-zinc-300'}`}>
                      {isAi ? 'AI Assistant' : 'Tim'}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(comment.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                    {comment.message}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={handleSend} className="p-3 bg-zinc-900/60 border-t border-zinc-800 flex gap-2">
        <input 
          type="text"
          placeholder="Ketik komentar atau sebut @AI..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
        />
        <Button 
          type="submit" 
          disabled={sending || !inputMessage.trim()}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 px-3"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </form>
    </div>
  )
}
