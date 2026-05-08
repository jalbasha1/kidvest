'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Suspense } from 'react'

const AVATAR_BG = ['#E1F5EE','#E6F1FB','#FAECE7','#F0E9FD','#FAEEDA','#FBEAF0','#EAF3DE']
const AVATAR_FG = ['#0F6E56','#185FA5','#993C1D','#5B3EA6','#854F0B','#993556','#3B6D11']
const COLORS = ['#1D9E75','#378ADD','#D85A30','#8B5CF6','#E5850A','#D4537E','#639922']

type Child = { id: string; name: string; balance: number; color: number }
type Transaction = { id: string; type: string; amount: number; note: string; created_at: string }
type HistoryPoint = { balance: number; recorded_at: string }

function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initials(name: string) {
  return name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
}

function ChildDashboardInner() {
  const router = useRouter()
  const params = useSearchParams()
  const childId = params.get('id')
  const [child, setChild] = useState<Child | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    if (!childId) { router.push('/dashboard'); return }

    const { data: childData } = await supabase.from('children').select('*').eq('id', childId).single()
    if (!childData) { router.push('/dashboard'); return }
    setChild(childData)

    const { data: txData } = await supabase.from('transactions').select('*').eq('child_id', childId).order('created_at', { ascending: false }).limit(30)
    setTransactions(txData || [])

    const { data: histData } = await supabase.from('balance_history').select('*').eq('child_id', childId).order('recorded_at', { ascending: true })
    setHistory(histData || [])

    setLoading(false)
  }, [childId, router])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 text-sm">Loading...</p></div>
  if (!child) return null

  const startBalance = history.length > 0 ? history[0].balance : child.balance
  const totalGain = child.balance - startBalance
  const totalPct = startBalance > 0 ? (totalGain / startBalance * 100) : 0

  const chartData = history.map((h, i) => ({
    label: i === 0 ? 'Start' : `Day ${i}`,
    balance: h.balance
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Back</Link>
        <span className="text-gray-300">|</span>
        <span className="text-lg font-medium">Kid<span style={{color:'#1D9E75'}}>Vest</span></span>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-medium"
            style={{background: AVATAR_BG[child.color % 7], color: AVATAR_FG[child.color % 7]}}>
            {initials(child.name)}
          </div>
          <div>
            <h1 className="text-xl font-medium">{child.name}</h1>
            <p className="text-sm text-gray-500">{history.length} data points tracked</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Balance</div>
            <div className="text-xl font-medium">{fmt(child.balance)}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Total gain/loss</div>
            <div className={`text-xl font-medium ${totalGain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {totalGain >= 0 ? '+' : ''}{fmt(totalGain)}
            </div>
            <div className={`text-xs ${totalGain >= 0 ? 'text-green-500' : 'text-red-400'}`}>
              {totalGain >= 0 ? '+' : ''}{totalPct.toFixed(1)}% all time
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Starting balance</div>
            <div className="text-xl font-medium">{fmt(startBalance)}</div>
          </div>
        </div>

        {chartData.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
            <h2 className="text-sm font-medium mb-4">Balance history</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{fontSize: 11}} tickLine={false} axisLine={false}
                  interval={Math.floor(chartData.length / 6)} />
                <YAxis tick={{fontSize: 11}} tickLine={false} axisLine={false}
                  tickFormatter={v => '$' + v.toLocaleString()} width={65} />
                <Tooltip formatter={(v: number) => [fmt(v), 'Balance']} labelStyle={{fontSize: 12}} />
                <Line type="monotone" dataKey="balance" stroke={COLORS[child.color % 7]}
                  strokeWidth={2} dot={chartData.length > 20 ? false : {r: 3}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium mb-3">Transaction history</h2>
          {transactions.length === 0 ? (
            <p className="text-sm text-gray-400">No transactions yet.</p>
          ) : (
            <div className="space-y-1">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="text-sm">{tx.note || tx.type}</span>
                    <span className="text-xs text-gray-400 ml-2">{new Date(tx.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric'})}</span>
                  </div>
                  <span className={`text-sm font-medium ${tx.type === 'deposit' || tx.type === 'gain' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'deposit' || tx.type === 'gain' ? '+' : '-'}{fmt(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ChildDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 text-sm">Loading...</p></div>}>
      <ChildDashboardInner />
    </Suspense>
  )
}
