import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Org not found' }, { status: 400 })
    }

    const now = new Date()
    const weekStart = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0]
    const weekEnd = new Date(now.setDate(now.getDate() - now.getDay() + 6)).toISOString().split('T')[0]

    // Completed tasks in current week. pm_tasks has no dedicated completed_at
    // column, so updated_at (bumped whenever status changes, including to
    // 'done') is the best available proxy for "finished this week".
    const { data: completedTasks } = await supabase
      .from('pm_tasks')
      .select('id, task_number, title')
      .eq('org_id', profile.org_id)
      .eq('status', 'done')
      .gte('updated_at', `${weekStart}T00:00:00`)
      .lte('updated_at', `${weekEnd}T23:59:59`)

    // Upcoming tasks: this is a live snapshot of currently open work (not an
    // accumulating list like completedTasks above), so it's intentionally not
    // date-bounded — an undated backlog item is still worth surfacing here.
    const { data: upcomingTasks } = await supabase
      .from('pm_tasks')
      .select('id, task_number, title')
      .eq('org_id', profile.org_id)
      .in('status', ['todo', 'in_progress'])

    const completedIds = (completedTasks || []).map(t => t.id)
    const upcomingIds = (upcomingTasks || []).map(t => t.id)

    let summaryText = `Minggu ini kamu telah menyelesaikan ${completedIds.length} task. Ada ${upcomingIds.length} task yang perlu dikerjakan.`

    const apiKey = process.env.OPENAI_API_KEY
    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey })
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Buatkan narasi pembuka ringkas 2 kalimat dalam Bahasa Indonesia untuk rangkuman mingguan project management ERP.'
            },
            {
              role: 'user',
              content: `Task selesai (${completedIds.length}): ${JSON.stringify(completedTasks)}. Task akan datang (${upcomingIds.length}): ${JSON.stringify(upcomingTasks)}.`
            }
          ]
        })
        if (res.choices[0].message.content) {
          summaryText = res.choices[0].message.content
        }
      } catch (err) {
        console.warn('AI summary failed, fallback used:', err)
      }
    }

    const { data: recap, error: recapErr } = await supabase
      .from('pm_weekly_recaps')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        week_start: weekStart,
        week_end: weekEnd,
        completed_task_ids: completedIds,
        upcoming_task_ids: upcomingIds,
        summary_text: summaryText
      })
      .select('*')
      .single()

    if (recapErr) {
      return NextResponse.json({ error: recapErr.message }, { status: 500 })
    }

    return NextResponse.json({ recap })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
