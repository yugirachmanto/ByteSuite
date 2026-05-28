import { createClient } from '@/lib/supabase/server';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import OpenAI from 'openai';
import { NextRequest } from 'next/server';

// Define tools with raw JSON Schema (bypasses zod conversion bugs)
const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'getInvoices',
      description: 'Get recent invoices or search by status (pending, extracted, reviewed, posted).',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status. Use "pending" or "extracted" for invoices to be reviewed; "reviewed" for approved; "posted" for posted. Can be a comma-separated list like "pending,extracted". Use "all" for no filter.' },
          limit: { type: 'number', description: 'Max results to return, default 10' }
        },
        required: ['status', 'limit']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getVendors',
      description: 'Get a list of vendors in the organization.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Name search query. Use empty string for all vendors.' }
        },
        required: ['search']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getFinancialSummary',
      description: 'Get a summary of invoice totals grouped by status for the current organization.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The financial query type, e.g. "summary".' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getItems',
      description: 'Get the item master list or search for specific items.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search by item name or category. Use empty string for all items.' }
        },
        required: ['search']
      }
    }
  }
];

async function executeTool(
  name: string,
  args: Record<string, any>,
  supabase: any,
  orgId: string
): Promise<string> {
  try {
    switch (name) {
      case 'getInvoices': {
        const queryLimit = args.limit || 10;
        let query = supabase
          .from('invoices')
          .select('id, invoice_no, vendor, grand_total, status, invoice_date, outlets!inner(org_id)')
          .eq('outlets.org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(queryLimit);

        if (args.status && args.status !== 'all') {
          const statuses = args.status.split(',').map((s: string) => s.trim());
          if (statuses.length > 1) {
            query = query.in('status', statuses);
          } else {
            query = query.eq('status', statuses[0]);
          }
        }
        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });

        const result = data?.map((d: any) => ({
          id: d.id,
          invoice_no: d.invoice_no,
          vendor: d.vendor,
          status: d.status,
          date: d.invoice_date,
          total: d.grand_total
        })) || [];
        return JSON.stringify(result);
      }

      case 'getVendors': {
        let query = supabase
          .from('vendors')
          .select('id, name, email, phone, bank_name, bank_account_no, bank_account_name')
          .eq('org_id', orgId);
        if (args.search) query = query.ilike('name', `%${args.search}%`);
        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data || []);
      }

      case 'getFinancialSummary': {
        const { data, error } = await supabase
          .from('invoices')
          .select('status, grand_total, outlets!inner(org_id)')
          .eq('outlets.org_id', orgId);

        if (error) return JSON.stringify({ error: error.message });
        if (!data) return JSON.stringify({ message: 'No data found' });

        const summary = data.reduce((acc: any, curr: any) => {
          acc[curr.status] = (acc[curr.status] || 0) + (Number(curr.grand_total) || 0);
          return acc;
        }, {} as Record<string, number>);
        return JSON.stringify(summary);
      }

      case 'getItems': {
        let query = supabase
          .from('item_master')
          .select('id, name, unit, category')
          .eq('org_id', orgId);
        if (args.search) {
          query = query.or(`name.ilike.%${args.search}%,category.ilike.%${args.search}%`);
        }
        const { data, error } = await query.limit(20);
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data || []);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

const SYSTEM_PROMPT = `You are Sigma, a helpful AI assistant for an ERP system (ByteSuite). 
You can query data about the user's organization using the tools provided. 
Be concise, professional, and friendly. 
When summarizing financial data, use IDR currency format.
Do NOT hallucinate data. If a tool returns no data, tell the user you couldn't find it.

Important context about the invoice workflow:
- Invoices are uploaded and processed (OCR). Their initial status is "pending" or "extracted".
- Invoices in "pending" or "extracted" status are waiting to be reviewed and approved by the user.
- Once reviewed/approved, their status changes to "reviewed" (labeled "Approved" in the UI).
- Approved invoices are then posted to the ledger, changing their status to "posted".
- If the user asks for invoices "to review", "to be reviewed", "waiting for review", or "pending review", query them using status: "pending,extracted" to get both categories in a single call.`;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    const payload = await req.json();
    const orgId = req.headers.get('x-org-id') || req.nextUrl.searchParams.get('orgId') || payload.orgId;
    const sessionId = req.headers.get('x-session-id') || req.nextUrl.searchParams.get('sessionId') || payload.sessionId;
    const rawMessages = payload.messages;

    if (!orgId) {
      return new Response('Organization ID required', { status: 400 });
    }

    // Get API Key
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('credentials')
      .eq('user_id', user.id)
      .eq('provider', 'openai')
      .eq('is_active', true)
      .single();

    let apiKey = (integration?.credentials as any)?.api_key ?? null;
    if (!apiKey && process.env.OPENAI_API_KEY) {
      apiKey = process.env.OPENAI_API_KEY;
    }
    if (!apiKey) {
      return new Response('OpenAI API key not configured in Settings.', { status: 402 });
    }

    const openai = new OpenAI({ apiKey });

    // Handle Session
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const msgContent = rawMessages[0]?.content || rawMessages[0]?.parts?.[0]?.text || '';
      const title = (msgContent as string).substring(0, 50) || 'New Chat';
      const { data: newSession } = await supabase
        .from('chat_sessions')
        .insert({ user_id: user.id, org_id: orgId, title })
        .select('id')
        .single();
      if (newSession) activeSessionId = newSession.id;
    }

    // Save latest user message to DB
    const latestMessage = rawMessages[rawMessages.length - 1];
    if (latestMessage?.role === 'user' && activeSessionId) {
      const msgContent = latestMessage.content || latestMessage.parts?.[0]?.text || '';
      await supabase.from('chat_messages').insert({
        session_id: activeSessionId,
        role: 'user',
        content: msgContent
      });
    }

    // Convert UIMessage (parts-based) to OpenAI format (content-based)
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...rawMessages.map((m: any) => {
        const text = m.content || m.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') || '';
        return { role: m.role as 'user' | 'assistant', content: text };
      })
    ];

    // Run the OpenAI completion with tool-calling loop
    let finalText = '';

    // Tool-calling loop (max 5 iterations)
    for (let step = 0; step < 5; step++) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: openaiMessages,
        tools: toolDefinitions,
        tool_choice: 'auto'
      });

      const choice = completion.choices[0];
      const message = choice.message;

      // Add assistant message to conversation
      openaiMessages.push(message);

      // If no tool calls, we have the final answer
      if (!message.tool_calls || message.tool_calls.length === 0) {
        finalText = message.content || '';
        break;
      }

      // Execute all tool calls
      for (const toolCall of message.tool_calls) {
        const fn = (toolCall as any).function;
        const args = JSON.parse(fn.arguments);
        const result = await executeTool(fn.name, args, supabase, orgId);

        openaiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        });
      }
      // Loop continues to get final text response after tool results
    }

    // Save assistant response to DB
    if (activeSessionId && finalText) {
      await supabase.from('chat_messages').insert({
        session_id: activeSessionId,
        role: 'assistant',
        content: finalText
      });
    }

    // Return as UIMessageStream so DefaultChatTransport can parse it
    const messageId = crypto.randomUUID();
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: 'text-start', id: messageId });
        writer.write({ type: 'text-delta', id: messageId, delta: finalText });
        writer.write({ type: 'text-end', id: messageId });
      }
    });

    return createUIMessageStreamResponse({
      stream,
      headers: { 'x-session-id': activeSessionId || '' }
    });

  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(error.message || 'Internal Server Error', { status: 500 });
  }
}
