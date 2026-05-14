'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Wallet, BarChart2, Target, Plus, Trash2, ToggleLeft, ToggleRight, Save, Settings2 } from 'lucide-react'

const AVATAR_BG = ['#E1F5EE','#E6F1FB','#FAECE7','#F0E9FD','#FAEEDA','#FBEAF0','#EAF3DE']
const AVATAR_FG = ['#0F6E56','#185FA5','#993C1D','#5B3EA6','#854F0B','#993556','#3B6D11']
const COLORS    = ['#1D9E75','#378ADD','#D85A30','#8B5CF6','#E5850A','#D4537E','#639922']

type Child = {
  id: string; name: string; balance: number; color: number
  sim_enabled: boolean; sim_mode: 'percent' | 'amount'; sim_min_val: number; sim_max_val: number
}
type SimDraft = { sim_enabled: boolean; sim_mode: 'percent' | 'amount'; sim_min_val: number; sim_max_val: number }
type Transaction = { id: string; type: string; amount: number; note: string; created_at: string }
type HistoryPoint = { balance: number; recorded_at: string }
type Goal = { id: string; name: string; target_amount: number }

function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initials(name: string) {
  return name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
}

type TxType = 'deposit' | 'withdraw' | 'gain' | 'loss'
const TX_META: Record<TxType, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  deposit:  { label: 'Deposit',     bg: '#ECFDF5', text: '#0F6E56', icon: TrendingUp   },
  withdraw: { label: 'Withdrawal',  bg: '#FEF2F2', text: '#B91C1C', icon: TrendingDown },
  gain:     { label: 'Market Gain', bg: '#ECFDF5', text: '#0F6E56', icon: TrendingUp   },
  loss:     { label: 'Market Loss', bg: '#FEF2F2', text: '#B91C1C', icon: TrendingDown },
}

function TxBadge({ type }: { type: string }) {
  const meta = TX_META[type as TxType] ?? { label: type, bg: '#F1F5F9', text: '#475569', icon: Minus }
  const Icon = meta.icon
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: meta.bg, color: meta.text }}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  )
}

function ChildDashboardInner() {
  const router = useRouter()
  const params = useSearchParams()
  const childId = params.get('id')
  const [child, setChild] = useState<Child | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [newGoalName, setNewGoalName] = useState('')
  const [newGoalTarget, setNewGoalTarget] = useState('')
  const [addingGoal, setAddingGoal] = useState(false)
  const [simDraft, setSimDraft] = useState<SimDraft>({ sim_enabled: true, sim_mode: 'percent', sim_min_val: -0.15, sim_max_val: 0.15 })
  const [simSaving, setSimSaving] = useState(false)
  const [simSaved, setSimSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    if (!childId) { router.push('/dashboard'); return }
    const { data: childData } = await supabase.from('children').select('*').eq('id', childId).single()
    if (!childData) { router.push('/dashboard'); return }
    setChild(childData)
    setSimDraft({
      sim_enabled: childData.sim_enabled ?? true,
      sim_mode:    childData.sim_mode    ?? 'percent',
      sim_min_val: childData.sim_min_val ?? -0.15,
      sim_max_val: childData.sim_max_val ?? 0.15,
    })
    const { data: txData } = await supabase
      .from('transactions').select('*').eq('child_id', childId)
      .order('created_at', { ascending: false }).limit(50)
    setTransactions(txData || [])
    const { data: histData } = await supabase
      .from('balance_history').select('*').eq('child_id', childId)
      .order('recorded_at', { ascending: true })
    setHistory(histData || [])
    const { data: goalsData } = await supabase
      .from('goals').select('id, name, target_amount').eq('child_id', childId)
      .order('created_at', { ascending: true })
    setGoals(goalsData || [])
    setLoading(false)
  }, [childId, router])

  useEffect(() => { load() }, [load])

  async function addGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!newGoalName.trim() || !child) return
    const target = parseFloat(newGoalTarget)
    if (!target || target <= 0) return
    setAddingGoal(true)
    await supabase.from('goals').insert({ child_id: child.id, name: newGoalName.trim(), target_amount: target })
    setNewGoalName(''); setNewGoalTarget('')
    setAddingGoal(false)
    load()
  }

  async function removeGoal(goalId: string) {
    await supabase.from('goals').delete().eq('id', goalId)
    load()
  }

  async function saveSimSettings() {
    if (!child) return
    if (simDraft.sim_min_val > simDraft.sim_max_val) { alert('Min must be ≤ Max.'); return }
    setSimSaving(true)
    await supabase.from('children').update({
      sim_enabled: simDraft.sim_enabled,
      sim_mode:    simDraft.sim_mode,
      sim_min_val: simDraft.sim_min_val,
      sim_max_val: simDraft.sim_max_val,
    }).eq('id', child.id)
    setSimSaving(false)
    setSimSaved(true)
    setTimeout(() => setSimSaved(false), 2000)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: '#1D9E75' }}>
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    </div>
  )
  if (!child) return null

  const startBalance = history.length > 0 ? history[0].balance : child.balance
  const totalGain = child.balance - startBalance
  const totalPct  = startBalance > 0 ? (totalGain / startBalance * 100) : 0
  const accentColor = COLORS[child.color % 7]

  const chartData = history.map((h, i) => ({
    label: i === 0 ? 'Start' : `Day ${i}`,
    balance: h.balance,
  }))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-3 sticky top-0 z-20">
        <Link href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <span className="text-slate-200">|</span>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#1D9E75' }}>
            <TrendingUp className="w-3 h-3 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-slate-900 tracking-tight text-sm">KidVest</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Hero card */}
        <div className="rounded-2xl p-6 text-white relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${AVATAR_FG[child.color % 7]} 0%, ${accentColor} 100%)` }}>
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
          <div className="relative flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold ring-4 ring-white/20"
              style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
              {initials(child.name)}
            </div>
            <div>
              <h1 className="text-xl font-bold">{child.name}</h1>
              <p className="text-white/70 text-sm">{history.length} data points tracked</p>
            </div>
          </div>
          <p className="text-white/70 text-sm mb-0.5">Current Balance</p>
          <p className="text-4xl font-bold tracking-tight">{fmt(child.balance)}</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart2 className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs text-slate-400 font-medium">All-time gain</p>
            </div>
            <p className={`text-xl font-bold ${totalGain >= 0 ? 'text-brand' : 'text-red-500'}`}>
              {totalGain >= 0 ? '+' : ''}{fmt(totalGain)}
            </p>
            <p className={`text-xs font-semibold mt-0.5 ${totalGain >= 0 ? 'text-brand' : 'text-red-400'}`}>
              {totalGain >= 0 ? '+' : ''}{totalPct.toFixed(1)}%
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
            <div className="flex items-center gap-1.5 mb-2">
              <Wallet className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs text-slate-400 font-medium">Starting balance</p>
            </div>
            <p className="text-xl font-bold text-slate-800">{fmt(startBalance)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs text-slate-400 font-medium">Transactions</p>
            </div>
            <p className="text-xl font-bold text-slate-800">{transactions.length}</p>
          </div>
        </div>

        {/* Savings Goals */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}20` }}>
                <Target className="w-3.5 h-3.5" style={{ color: accentColor }} />
              </div>
              <h2 className="text-sm font-semibold text-slate-800">Savings goals</h2>
            </div>
          </div>

          {/* Existing goals */}
          {goals.length > 0 && (
            <div className="space-y-4 mb-5">
              {goals.map(goal => {
                const pct = Math.min(100, (child.balance / goal.target_amount) * 100)
                const reached = child.balance >= goal.target_amount
                const remaining = Math.max(0, goal.target_amount - child.balance)
                return (
                  <div key={goal.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-700">{goal.name}</span>
                        {reached && <span className="text-xs bg-brand-light text-brand font-semibold px-2 py-0.5 rounded-full">Reached! 🎉</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">
                          {reached ? fmt(goal.target_amount) : `${fmt(Math.min(child.balance, goal.target_amount))} / ${fmt(goal.target_amount)}`}
                        </span>
                        <button onClick={() => removeGoal(goal.id)}
                          className="text-slate-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: reached
                            ? `linear-gradient(90deg, #0F6E56, ${accentColor})`
                            : `linear-gradient(90deg, ${accentColor}80, ${accentColor})`,
                        }}
                      />
                    </div>
                    {!reached && (
                      <p className="text-xs text-slate-400 mt-1">{fmt(remaining)} remaining</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add goal form */}
          <form onSubmit={addGoal} className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
            <input value={newGoalName} onChange={e => setNewGoalName(e.target.value)}
              placeholder="Goal name (e.g. New bike)"
              className="flex-1 min-w-32 h-9 px-3 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:border-transparent transition"
              style={{ ['--tw-ring-color' as string]: accentColor }} />
            <input value={newGoalTarget} onChange={e => setNewGoalTarget(e.target.value)}
              type="number" min="1" step="1" placeholder="Target $"
              className="w-28 h-9 px-3 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:border-transparent transition"
              style={{ ['--tw-ring-color' as string]: accentColor }} />
            <button type="submit" disabled={addingGoal}
              className="h-9 px-4 rounded-xl text-white text-sm font-semibold flex items-center gap-1.5 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
              style={{ background: `linear-gradient(135deg, ${accentColor}, ${AVATAR_FG[child.color % 7]})` }}>
              <Plus className="w-3.5 h-3.5" />{addingGoal ? 'Adding…' : 'Add goal'}
            </button>
          </form>
        </div>

        {/* Chart */}
        {chartData.length > 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Balance history</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`grad-${child.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={accentColor} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={accentColor} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                  tickFormatter={v => '$' + v.toLocaleString()} width={68} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)', fontSize: 13 }}
                  formatter={(v: number) => [fmt(v), 'Balance']}
                  labelStyle={{ color: '#64748B', fontWeight: 500 }}
                />
                <Area type="monotone" dataKey="balance"
                  stroke={accentColor} strokeWidth={2.5}
                  fill={`url(#grad-${child.id})`}
                  dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Transaction table */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Transaction history</h2>
          {transactions.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide pb-3 px-1">Type</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide pb-3 px-1">Description</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide pb-3 px-1">Date</th>
                    <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide pb-3 px-1">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => {
                    const isPositive = tx.type === 'deposit' || tx.type === 'gain'
                    return (
                      <tr key={tx.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-1"><TxBadge type={tx.type} /></td>
                        <td className="py-3 px-1 text-sm text-slate-600 max-w-[180px] truncate">{tx.note || tx.type}</td>
                        <td className="py-3 px-1 text-xs text-slate-400 whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className={`py-3 px-1 text-right text-sm font-bold whitespace-nowrap ${isPositive ? 'text-brand' : 'text-red-500'}`}>
                          {isPositive ? '+' : '-'}{fmt(tx.amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Auto-update settings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
              <Settings2 className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <h2 className="text-sm font-semibold text-slate-800">Auto-update settings</h2>
            <span className="ml-auto text-xs text-slate-400">Daily market simulation</span>
          </div>

          <div className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Daily auto-update</p>
                <p className="text-xs text-slate-400 mt-0.5">Apply a random market move each midnight</p>
              </div>
              <button
                onClick={() => setSimDraft(d => ({ ...d, sim_enabled: !d.sim_enabled }))}
                className="flex items-center gap-1.5 text-sm font-semibold transition-colors"
                style={{ color: simDraft.sim_enabled ? accentColor : '#94A3B8' }}>
                {simDraft.sim_enabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                <span className="text-xs">{simDraft.sim_enabled ? 'Active' : 'Paused'}</span>
              </button>
            </div>

            {simDraft.sim_enabled && (
              <>
                {/* Mode */}
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Change mode</p>
                  <div className="flex gap-2">
                    {(['percent', 'amount'] as const).map(m => (
                      <button key={m}
                        onClick={() => setSimDraft(d => ({
                          ...d, sim_mode: m,
                          sim_min_val: m === 'percent' ? -0.15 : -0.10,
                          sim_max_val: m === 'percent' ?  0.15 :  0.25,
                        }))}
                        className={`h-8 px-3 rounded-lg text-xs font-semibold border-2 transition-all ${
                          simDraft.sim_mode === m ? 'border-current' : 'border-transparent bg-slate-100 text-slate-500 hover:border-slate-200'
                        }`}
                        style={simDraft.sim_mode === m ? { borderColor: accentColor, color: accentColor, background: AVATAR_BG[child.color % 7] } : {}}>
                        {m === 'percent' ? '% / day' : '$ / day'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Range */}
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Daily range</p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-6">Min</span>
                      <input type="number" step="0.01" value={simDraft.sim_min_val}
                        onChange={e => setSimDraft(d => ({ ...d, sim_min_val: parseFloat(e.target.value) || 0 }))}
                        className="w-20 h-8 px-2.5 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition" />
                      <span className="text-xs text-slate-400">{simDraft.sim_mode === 'percent' ? '%' : '$'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-6">Max</span>
                      <input type="number" step="0.01" value={simDraft.sim_max_val}
                        onChange={e => setSimDraft(d => ({ ...d, sim_max_val: parseFloat(e.target.value) || 0 }))}
                        className="w-20 h-8 px-2.5 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition" />
                      <span className="text-xs text-slate-400">{simDraft.sim_mode === 'percent' ? '%' : '$'}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {simDraft.sim_mode === 'percent'
                      ? `Picks randomly between ${simDraft.sim_min_val}% and ${simDraft.sim_max_val}% each day`
                      : `Picks randomly between ${simDraft.sim_min_val < 0 ? '-' : ''}$${Math.abs(simDraft.sim_min_val).toFixed(2)} and $${simDraft.sim_max_val.toFixed(2)} each day`}
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end pt-1">
              <button onClick={saveSimSettings} disabled={simSaving}
                className={`flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-semibold transition-all ${
                  simSaved
                    ? 'bg-brand-light text-brand border border-brand/20'
                    : 'text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50'
                }`}
                style={!simSaved ? { background: `linear-gradient(135deg, ${accentColor}, ${AVATAR_FG[child.color % 7]})` } : {}}>
                <Save className="w-3 h-3" />
                {simSaving ? 'Saving…' : simSaved ? 'Saved!' : 'Save settings'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

export default function ChildDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    }>
      <ChildDashboardInner />
    </Suspense>
  )
}
