'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const COLORS = ['#1D9E75','#378ADD','#D85A30','#8B5CF6','#E5850A','#D4537E','#639922']
const AVATAR_BG = ['#E1F5EE','#E6F1FB','#FAECE7','#F0E9FD','#FAEEDA','#FBEAF0','#EAF3DE']
const AVATAR_FG = ['#0F6E56','#185FA5','#993C1D','#5B3EA6','#854F0B','#993556','#3B6D11']

type Child = {
  id: string
  name: string
  balance: number
  color: number
  last_change?: number
}

function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function Dashboard() {
  const router = useRouter()
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newBalance, setNewBalance] = useState('')
  const [txChild, setTxChild] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txNote, setTxNote] = useState('')
  const [simMode, setSimMode] = useState('random')
  const [customPct, setCustomPct] = useState('')
  const [simMsg, setSimMsg] = useState('')
  const [activeTab, setActiveTab] = useState<'overview'|'manage'|'simulate'>('overview')
  const [userEmail, setUserEmail] = useState('')

  const supabase = createClient()

  const loadChildren = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserEmail(session.user.email || '')
    const { data } = await supabase
      .from('children')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) {
      const withChange = await Promise.all(data.map(async (child) => {
        const { data: hist } = await supabase
          .from('balance_history')
          .select('balance')
          .eq('child_id', child.id)
          .order('recorded_at', { ascending: false })
          .limit(2)
        const lastChange = hist && hist.length >= 2 ? hist[0].balance - hist[1].balance : 0
        return { ...child, last_change: lastChange }
      }))
      setChildren(withChange)
      if (!txChild && withChange.length > 0) setTxChild(withChange[0].id)
    }
    setLoading(false)
  }, [router, txChild])

  useEffect(() => { loadChildren() }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function addChild(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const bal = parseFloat(newBalance) || 0
    const colorIdx = children.length % 7
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: child } = await supabase
      .from('children')
      .insert({ name: newName.trim(), balance: bal, color: colorIdx, parent_id: session.user.id })
      .select().single()

    if (child) {
      await supabase.from('balance_history').insert({ child_id: child.id, balance: bal })
      await supabase.from('transactions').insert({ child_id: child.id, type: 'deposit', amount: bal, note: 'Starting balance' })
    }

    setNewName(''); setNewBalance('')
    loadChildren()
  }

  async function removeChild(id: string) {
    if (!confirm('Remove this child and all their data?')) return
    await supabase.from('children').delete().eq('id', id)
    loadChildren()
  }

  async function doTransaction(type: 'deposit' | 'withdraw') {
    const amount = parseFloat(txAmount)
    if (!txChild || !amount || amount <= 0) return
    const child = children.find(c => c.id === txChild)
    if (!child) return
    if (type === 'withdraw' && amount > child.balance) { alert('Cannot withdraw more than current balance.'); return }
    const newBal = parseFloat((child.balance + (type === 'deposit' ? amount : -amount)).toFixed(2))
    await supabase.from('children').update({ balance: newBal }).eq('id', txChild)
    await supabase.from('transactions').insert({ child_id: txChild, type, amount, note: txNote || (type === 'deposit' ? 'Deposit' : 'Withdrawal') })
    await supabase.from('balance_history').insert({ child_id: txChild, balance: newBal })
    setTxAmount(''); setTxNote('')
    loadChildren()
  }

  function randomPct(mode: string) {
    if (mode === 'bull') return Math.random() * 3 + 0.5
    if (mode === 'bear') return -(Math.random() * 3 + 0.5)
    return Math.random() < 0.5 ? Math.random() * 4 : -(Math.random() * 4)
  }

  async function runSimDay() {
    if (!children.length) return
    const pct = simMode === 'custom' ? parseFloat(customPct) : randomPct(simMode)
    if (isNaN(pct)) return
    for (const child of children) {
      const change = parseFloat((child.balance * pct / 100).toFixed(2))
      const newBal = Math.max(0, parseFloat((child.balance + change).toFixed(2)))
      await supabase.from('children').update({ balance: newBal }).eq('id', child.id)
      await supabase.from('transactions').insert({ child_id: child.id, type: pct >= 0 ? 'gain' : 'loss', amount: Math.abs(change), note: `Market ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` })
      await supabase.from('balance_history').insert({ child_id: child.id, balance: newBal })
    }
    setSimMsg(`Market day applied: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`)
    loadChildren()
  }

  async function runSimDays(n: number) {
    if (!children.length) return
    for (let i = 0; i < n; i++) {
      const pct = simMode === 'custom' ? parseFloat(customPct) : randomPct(simMode)
      if (isNaN(pct)) continue
      for (const child of children) {
        const change = parseFloat((child.balance * pct / 100).toFixed(2))
        const newBal = Math.max(0, parseFloat((child.balance + change).toFixed(2)))
        await supabase.from('children').update({ balance: newBal }).eq('id', child.id)
        await supabase.from('transactions').insert({ child_id: child.id, type: pct >= 0 ? 'gain' : 'loss', amount: Math.abs(change), note: `Market ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` })
        await supabase.from('balance_history').insert({ child_id: child.id, balance: newBal })
      }
    }
    setSimMsg(`Ran ${n} market days`)
    loadChildren()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm">Loading...</p>
    </div>
  )

  const totalPortfolio = children.reduce((s, c) => s + c.balance, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <span className="text-lg font-medium">Kid<span style={{color:'#1D9E75'}}>Vest</span></span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400 hidden sm:block">{userEmail}</span>
          <button onClick={signOut} className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">Sign out</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6">
          {(['overview','manage','simulate'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${activeTab === tab ? 'bg-white border border-gray-200 font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-xs text-gray-500 mb-1">Total portfolio</div>
                <div className="text-2xl font-medium">{fmt(totalPortfolio)}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-xs text-gray-500 mb-1">Children</div>
                <div className="text-2xl font-medium">{children.length}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {children.map((child, i) => (
                <Link key={child.id} href={`/dashboard/child?id=${child.id}`}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors block">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
                      style={{background: AVATAR_BG[child.color % 7], color: AVATAR_FG[child.color % 7]}}>
                      {initials(child.name)}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{child.name}</div>
                      <div className="text-xl font-medium">{fmt(child.balance)}</div>
                    </div>
                  </div>
                  {child.last_change !== undefined && child.last_change !== 0 && (
                    <div className={`text-xs ${child.last_change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {child.last_change >= 0 ? '+' : ''}{fmt(child.last_change)} last move
                    </div>
                  )}
                </Link>
              ))}
              {children.length === 0 && (
                <div className="col-span-2 text-center py-12 text-gray-400 text-sm">
                  No children yet. Go to Manage to add one.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'manage' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-medium mb-4">Add child account</h2>
              <form onSubmit={addChild} className="flex flex-wrap gap-3">
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Child's name"
                  className="flex-1 min-w-32 h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400" />
                <input value={newBalance} onChange={e => setNewBalance(e.target.value)} type="number" min="0" step="1" placeholder="Starting $ (optional)"
                  className="w-40 h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400" />
                <button type="submit" className="h-10 px-4 rounded-lg text-white text-sm font-medium" style={{background:'#1D9E75'}}>
                  Add child
                </button>
              </form>
            </div>

            {children.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-medium mb-4">Manage funds</h2>
                <div className="flex flex-wrap gap-3 mb-3">
                  <select value={txChild} onChange={e => setTxChild(e.target.value)}
                    className="h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400">
                    {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input value={txAmount} onChange={e => setTxAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Amount $"
                    className="w-32 h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400" />
                  <input value={txNote} onChange={e => setTxNote(e.target.value)} placeholder="Note (optional)"
                    className="flex-1 min-w-32 h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => doTransaction('deposit')} className="h-10 px-4 rounded-lg text-white text-sm font-medium" style={{background:'#1D9E75'}}>
                    + Add money
                  </button>
                  <button onClick={() => doTransaction('withdraw')} className="h-10 px-4 rounded-lg text-sm font-medium border border-red-300 text-red-600 hover:bg-red-50">
                    − Remove money
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-medium mb-3">Child accounts</h2>
              {children.length === 0 ? (
                <p className="text-sm text-gray-400">No children added yet.</p>
              ) : (
                <div className="space-y-2">
                  {children.map(child => (
                    <div key={child.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                          style={{background: AVATAR_BG[child.color % 7], color: AVATAR_FG[child.color % 7]}}>
                          {initials(child.name)}
                        </div>
                        <span className="text-sm">{child.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{fmt(child.balance)}</span>
                        <button onClick={() => removeChild(child.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'simulate' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-medium mb-1">Market simulator</h2>
              <p className="text-xs text-gray-500 mb-4">Simulate daily market movements for all children at once.</p>
              <div className="flex flex-wrap gap-3 mb-4">
                <select value={simMode} onChange={e => setSimMode(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400">
                  <option value="random">Random day</option>
                  <option value="bull">Bull day (+)</option>
                  <option value="bear">Bear day (−)</option>
                  <option value="custom">Custom %</option>
                </select>
                {simMode === 'custom' && (
                  <input value={customPct} onChange={e => setCustomPct(e.target.value)} type="number" step="0.1" placeholder="e.g. -2.5"
                    className="w-28 h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400" />
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={runSimDay} className="h-10 px-4 rounded-lg text-white text-sm font-medium" style={{background:'#1D9E75'}}>
                  Run 1 day
                </button>
                <button onClick={() => runSimDays(7)} className="h-10 px-4 rounded-lg text-sm border border-gray-200 hover:bg-gray-50">
                  Run 7 days
                </button>
                <button onClick={() => runSimDays(30)} className="h-10 px-4 rounded-lg text-sm border border-gray-200 hover:bg-gray-50">
                  Run 30 days
                </button>
              </div>
              {simMsg && <p className="text-xs text-gray-500 mt-3">{simMsg}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {children.map(child => (
                <div key={child.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                      style={{background: AVATAR_BG[child.color % 7], color: AVATAR_FG[child.color % 7]}}>
                      {initials(child.name)}
                    </div>
                    <span className="text-sm font-medium">{child.name}</span>
                  </div>
                  <div className="text-xl font-medium">{fmt(child.balance)}</div>
                  {child.last_change !== undefined && child.last_change !== 0 && (
                    <div className={`text-xs mt-1 ${child.last_change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {child.last_change >= 0 ? '+' : ''}{fmt(child.last_change)} last move
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
