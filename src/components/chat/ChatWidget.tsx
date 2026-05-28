'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { MessageCircle, X, Maximize2, Minimize2, Trash2, Pin, ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const { selectedOutletId } = useOutlet()
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const supabase = createClient()
  
  useEffect(() => {
    async function fetchOrgId() {
      if (!selectedOutletId) return;
      const { data } = await supabase.from('outlets').select('org_id').eq('id', selectedOutletId).single();
      if (data) setCurrentOrgId(data.org_id);
    }
    fetchOrgId();
  }, [selectedOutletId])
  
  // Custom Session Management
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<any[]>([])
  
  // Custom input state because newer useChat doesn't provide it
  const [input, setInput] = useState('')
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)

  // Store latest context in refs to avoid recreating transport which useChat might ignore
  const contextRef = useRef({ orgId: currentOrgId, sessionId: sessionId })
  useEffect(() => {
    contextRef.current = { orgId: currentOrgId, sessionId: sessionId }
  }, [currentOrgId, sessionId])

  // Dynamic transport to ensure payload is up to date without recreating transport
  const transport = React.useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    fetch: async (url, init) => {
      // Intercept the fetch call to inject dynamic variables into the headers
      const { orgId, sessionId } = contextRef.current;
      
      const newHeaders = new Headers(init?.headers);
      if (orgId) newHeaders.set('x-org-id', orgId);
      if (sessionId) newHeaders.set('x-session-id', sessionId);
      
      return fetch(url, { ...init, headers: newHeaders });
    }
  }), [])

  // ai-sdk hook
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport
  })

  useEffect(() => {
    if (error) {
      if (error.message.includes('402')) {
        toast.error('OpenAI API Key not configured. Please add it in Settings > Integrations.')
      } else {
        toast.error('Failed to send message: ' + error.message)
      }
    }
  }, [error])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim() || !currentOrgId) return
    
    // Auto-generate session ID if it doesn't exist yet
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID()
      setSessionId(activeSessionId)
      contextRef.current.sessionId = activeSessionId
      // refresh list soon
      setTimeout(loadSessions, 1500)
    }

    sendMessage({ role: 'user', parts: [{ type: 'text', text: input }], id: crypto.randomUUID() })
    setInput('')
  }

  const isLoading = status === 'submitted' || status === 'streaming'

  // Scroll to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Load history
  const loadSessions = async () => {
    if (!currentOrgId) return
    const { data } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('org_id', currentOrgId)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    
    if (data) setSessions(data)
  }

  useEffect(() => {
    if (isOpen && currentOrgId) {
      loadSessions()
    }
  }, [isOpen, currentOrgId])

  const loadChat = async (sid: string) => {
    setSessionId(sid)
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sid)
      .order('created_at', { ascending: true })
    
    if (data) {
      setMessages(data.map(m => ({
        id: m.id,
        role: m.role as any,
        parts: [{ type: 'text', text: m.content }]
      })))
    }
    setShowHistory(false)
  }

  const startNewChat = () => {
    setSessionId(null)
    setMessages([])
    setShowHistory(false)
  }

  const deleteSession = async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation()
    const { error } = await supabase.from('chat_sessions').delete().eq('id', sid)
    if (!error) {
      toast.success('Chat deleted')
      loadSessions()
      if (sessionId === sid) startNewChat()
    }
  }

  const togglePin = async (e: React.MouseEvent, sid: string, currentPin: boolean) => {
    e.stopPropagation()
    const { error } = await supabase.from('chat_sessions').update({ is_pinned: !currentPin }).eq('id', sid)
    if (!error) loadSessions()
  }

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 z-50"
      >
        <MessageCircle size={24} />
      </button>
    )
  }

  return (
    <div className={cn(
      "fixed bottom-6 right-6 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden transition-all duration-200",
      isExpanded ? "w-[800px] h-[80vh] max-h-[800px]" : "w-[400px] h-[600px] max-h-[80vh]"
    )}>
      {/* Header */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 shrink-0">
        <div className="flex items-center gap-2">
          {showHistory ? (
            <span className="font-semibold text-sm text-zinc-100">Chat History</span>
          ) : (
            <>
              <button onClick={() => setShowHistory(true)} className="p-1 hover:bg-zinc-800 rounded text-zinc-400">
                <ChevronLeft size={18} />
              </button>
              <span className="font-semibold text-sm text-zinc-100">Sigma AI Assistant</span>
              <button onClick={startNewChat} className="ml-2 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded">New</button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:bg-zinc-800 rounded text-zinc-400">
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-zinc-800 rounded text-zinc-400">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {showHistory ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {sessions.map(s => (
              <div 
                key={s.id} 
                onClick={() => loadChat(s.id)}
                className={cn(
                  "p-3 rounded-lg border cursor-pointer hover:bg-zinc-900 transition-colors group",
                  sessionId === s.id ? "bg-zinc-900 border-indigo-500/50" : "bg-zinc-950 border-zinc-800"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 pr-2">
                    {s.is_pinned && <Pin size={12} className="text-indigo-400 shrink-0" />}
                    <p className="text-sm text-zinc-200 line-clamp-1">{s.title}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={(e) => togglePin(e, s.id, s.is_pinned)} className="p-1 text-zinc-500 hover:text-indigo-400">
                      <Pin size={14} />
                    </button>
                    <button onClick={(e) => deleteSession(e, s.id)} className="p-1 text-zinc-500 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  {new Date(s.updated_at).toLocaleDateString()}
                </p>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="text-sm text-zinc-500 text-center mt-10">No chat history found.</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-zinc-500">
                  <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-8 h-8 text-indigo-400" />
                  </div>
                  <p className="text-sm">Hi! I'm Sigma, your AI assistant.<br/>Ask me about invoices, vendors, or stock.</p>
                </div>
              ) : (
                messages.map(m => (
                  <div key={m.id} className={cn("flex w-full", m.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                      m.role === 'user' 
                        ? "bg-indigo-600 text-white rounded-br-none" 
                        : "bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-none"
                    )}>
                    {m.parts ? m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') : (m as any).content}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex w-full justify-start">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-indigo-400" />
                    <span className="text-xs text-zinc-400">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input Area */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-zinc-950 border-t border-zinc-800">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input 
                  value={input} 
                  onChange={handleInputChange} 
                  placeholder="Ask anything..." 
                  className="bg-zinc-900 border-zinc-800 focus-visible:ring-indigo-500"
                  disabled={isLoading || !currentOrgId}
                />
                <Button type="submit" size="icon" className="bg-indigo-600 hover:bg-indigo-700 shrink-0" disabled={isLoading || !input.trim() || !currentOrgId}>
                  <MessageCircle size={18} />
                </Button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
