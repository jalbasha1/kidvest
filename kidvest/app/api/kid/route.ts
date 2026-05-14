import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: child, error } = await supabase
    .from('children')
    .select('id, name, balance, color')
    .eq('view_token', token)
    .maybeSingle()

  if (error || !child) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [{ data: transactions }, { data: history }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, type, amount, note, created_at')
      .eq('child_id', child.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('balance_history')
      .select('balance, recorded_at')
      .eq('child_id', child.id)
      .order('recorded_at', { ascending: true }),
  ])

  return NextResponse.json({ child, transactions: transactions || [], history: history || [] })
}
