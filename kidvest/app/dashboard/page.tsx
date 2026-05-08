'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import {
  LayoutDashboard, Users, TrendingUp, LogOut, ChevronRight,
  Plus, Minus, Trash2, TrendingDown, Shuffle, PencilLine, Wallet,
  Clock, ToggleLeft, ToggleRight, Save,
} from 'lucide-react'

const AVATAR_BG = ['#E1F5EE','#E6F1FB','#FAECE7','#F0E9FD','#FAEEDA','#FBEAF0','#EAF3DE']
const AVATAR_FG = ['#0F6E56','#185FA5','#993C1D','#5B3EA6','#854F0B','#993556','#3B6D11']

type Child = { id: string; name: string; balance: number; color: number; last_change?: number }

type SimConfig = {
  id?: string
  enabled: boolean
  mode: 'percent' | 'amount'
  min_val: number
  max_val: number
  last_run_date: string | null
}

const DEFAULT_CONFIG: SimConfig = { enabled: false, mode: 'percent', min_val: -0.15, max_val: 0.15, last_run_date: null }

function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const SIM_MODES = [
  { value: 'random', icon: Shuffle,      label: 'Random',  desc: 'Up or down',    color: '#64748B', bg: '#F1F5F9' },
  { value: 'bull',   icon: TrendingUp,   label: 'Bull',    desc: 'Positive day',  color: '#1D9E75', bg: '#ECFDF5' },
  { value: 'bear',   icon: TrendingDown, label: 'Bear',    desc: 'Negative day',  color: '#EF4444', bg: '#FEF2F2' },
  { value: 'custom', icon: PencilLine,   label: 'Custom',  desc: 'Set your %',    color: '#8B5CF6', bg: '#F5F3FF' },
]

const TABS = [
  { id: 'overview',  label: 'Overview',  icon: LayoutDashboard },
  { id: 'manage',    label: 'Manage',    icon: Users },
  { id: 'simulate',  label: 'Simulate',  icon: TrendingUp },
] as const

type Tab = typeof TABS[number]['id']

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
  const [simRunning, setSimRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [userEmail, setUserEmail] = useState('')
  const [parentId, setParentId] = useState('')

  // Daily auto-update config
  const [simConfig, setSimConfig] = useState<SimConfig>(DEFAULT_CONFIG)
  const [configDraft, setConfigDraft] = useState<SimConfig>(DEFAULT_CONFIG)
  const [configSaving, setConfigSaving] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  const supabase = createClient()

  const loadChildren = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserEmail(session.user.email || '')
    setParentId(session.user.id)

    // Client-side daily sim catch-up — runs if today hasn't been processed yet
    const today = new Date().toISOString().split('T')[0]
    const { data: cfg } = await supabase
      .from('sim_config').select('enabled, last_run_date')
      .eq('parent_id', session.user.id).maybeSingle()
    if (cfg?.enabled && cfg.last_run_date !== today) {
      await supabase.rpc('run_daily_simulation_for_parent', { p_parent_id: session.user.id })
    }

    // Load full sim config for UI
    const { data: fullCfg } = await supabase
      .from('sim_config').select('*').eq('parent_id', session.user.id).maybeSingle()
    if (fullCfg) {
      setSimConfig(fullCfg)
      setConfigDraft(fullCfg)
    }

    // Load children
    const { data } = await supabase
      .from('children').select('*').order('created_at', { ascending: true })
    if (data) {
      const withChange = await Promise.all(data.map(async (child) => {
        const { data: hist } = await supabase
          .from('balance_history').select('balance').eq('child_id', child.id)
          .order('recorded_at', { ascending: false }).limit(2)
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

    const { data: child, error: insertError } = await supabase
      .from('children')
      .insert({ name: newName.trim(), balance: bal, color: colorIdx, parent_id: session.user.id })
      .select().single()

    if (insertError) {
      console.error('addChild insert error:', insertError)
      alert(`Could not add child: ${insertError.message}`)
      return
    }

    if (child) {
      if (bal > 0 && child.balance !== bal) {
        await supabase.from('children').update({ balance: bal }).eq('id', child.id)
      }
      if (bal > 0) {
        await supabase.from('balance_history').insert({ child_id: child.id, balance: bal })
        await supabase.from('transactions').insert({ child_id: child.id, type: 'deposit', amount: bal, note: 'Starting balance' })
      }
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
    setSimRunning(true)
    const pct = simMode === 'custom' ? parseFloat(customPct) : randomPct(simMode)
    if (isNaN(pct)) { setSimRunning(false); return }
    for (const child of children) {
      const change = parseFloat((child.balance * pct / 100).toFixed(2))
      const newBal = Math.max(0, parseFloat((child.balance + change).toFixed(2)))
      await supabase.from('children').update({ balance: newBal }).eq('id', child.id)
      await supabase.from('transactions').insert({ child_id: child.id, type: pct >= 0 ? 'gain' : 'loss', amount: Math.abs(change), note: `Market ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` })
      await supabase.from('balance_history').insert({ child_id: child.id, balance: newBal })
    }
    setSimMsg(`Market day: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% applied to all accounts`)
    setSimRunning(false)
    loadChildren()
  }

  async function runSimDays(n: number) {
    if (!children.length) return
    setSimRunning(true)
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
    setSimMsg(`Simulated ${n} market days`)
    setSimRunning(false)
    loadChildren()
  }

  async function saveSimConfig() {
    if (!parentId) return
    // Validate range
    if (configDraft.min_val > configDraft.max_val) {
      alert('Min value must be less than or equal to max value.')
      return
    }
    setConfigSaving(true)
    const payload = {
      parent_id: parentId,
      enabled: configDraft.enabled,
      mode: configDraft.mode,
      min_val: configDraft.min_val,
      max_val: configDraft.max_val,
    }
    const { data } = await supabase
      .from('sim_config')
      .upsert(payload, { onConflict: 'parent_id' })
      .select().maybeSingle()
    if (data) { setSimConfig(data); setConfigDraft(data) }
    setConfigSaving(false)
    setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 2500)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: '#1D9E75' }}>
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <p className="text-sm text-slate-400">Loading your dashboard…</p>
      </div>
    </div>
  )

  const totalPortfolio = children.reduce((s, c) => s + c.balance, 0)
  const totalChange = children.reduce((s, c) => s + (c.last_change || 0), 0)
  const selectedChild = children.find(c => c.id === txChild)
  const isDirty = JSON.stringify(configDraft) !== JSON.stringify(simConfig)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 px-6 py-0 flex items-center justify-between h-14 sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#1D9E75' }}>
            <TrendingUp className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-slate-900 tracking-tight">KidVest</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 hidden sm:block truncate max-w-[200px]">{userEmail}</span>
          <button onClick={signOut}
            className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-card">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === id ? 'bg-brand text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <div className="rounded-2xl p-6 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #0F6E56 0%, #1D9E75 60%, #34c993 100%)' }}>
              <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
              <div className="relative">
                <p className="text-emerald-100 text-sm font-medium mb-1">Total Portfolio Value</p>
                <p className="text-white text-4xl font-bold tracking-tight">{fmt(totalPortfolio)}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-emerald-100 text-sm">{children.length} young investor{children.length !== 1 ? 's' : ''}</span>
                  {totalChange !== 0 && (
                    <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${totalChange >= 0 ? 'bg-white/20 text-white' : 'bg-red-500/30 text-red-100'}`}>
                      {totalChange >= 0 ? '+' : ''}{fmt(totalChange)} today
                    </span>
                  )}
                </div>
              </div>
            </div>

            {children.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-card">
                <div className="w-12 h-12 rounded-2xl bg-brand-light flex items-center justify-center mx-auto mb-3">
                  <Users className="w-5 h-5 text-brand" />
                </div>
                <p className="text-slate-700 font-medium text-sm">No children yet</p>
                <p className="text-slate-400 text-xs mt-1">Go to Manage to add your first child account.</p>
                <button onClick={() => setActiveTab('manage')}
                  className="mt-4 text-sm font-semibold text-brand hover:text-brand-dark transition-colors">
                  Add a child →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {children.map(child => (
                  <Link key={child.id} href={`/dashboard/child?id=${child.id}`}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 hover:border-brand/40 hover:shadow-card-md transition-all shadow-card block">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ring-2 ring-white shadow-sm"
                          style={{ background: AVATAR_BG[child.color % 7], color: AVATAR_FG[child.color % 7] }}>
                          {initials(child.name)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{child.name}</p>
                          {child.last_change !== undefined && child.last_change !== 0 && (
                            <p className={`text-xs font-medium ${child.last_change >= 0 ? 'text-brand' : 'text-red-500'}`}>
                              {child.last_change >= 0 ? '+' : ''}{fmt(child.last_change)} last move
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand transition-colors" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{fmt(child.balance)}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MANAGE ── */}
        {activeTab === 'manage' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-brand-light flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5 text-brand" />
                </div>
                <h2 className="text-sm font-semibold text-slate-800">Add child account</h2>
              </div>
              <form onSubmit={addChild} className="flex flex-wrap gap-3">
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Child's name"
                  className="flex-1 min-w-32 h-10 px-3.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition" />
                <input value={newBalance} onChange={e => setNewBalance(e.target.value)} type="number" min="0" step="1" placeholder="Starting $ (optional)"
                  className="w-44 h-10 px-3.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition" />
                <button type="submit"
                  className="h-10 px-5 rounded-xl text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
                  style={{ background: 'linear-gradient(135deg, #1D9E75, #0F6E56)' }}>
                  Add child
                </button>
              </form>
            </div>

            {children.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-brand-light flex items-center justify-center">
                    <Wallet className="w-3.5 h-3.5 text-brand" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-800">Manage funds</h2>
                </div>
                <div className="flex flex-wrap gap-3 mb-4">
                  <select value={txChild} onChange={e => setTxChild(e.target.value)}
                    className="h-10 pl-3.5 pr-8 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition appearance-none">
                    {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input value={txAmount} onChange={e => setTxAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Amount $"
                    className="w-36 h-10 px-3.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition" />
                  <input value={txNote} onChange={e => setTxNote(e.target.value)} placeholder="Note (optional)"
                    className="flex-1 min-w-32 h-10 px-3.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition" />
                </div>
                {selectedChild && (
                  <p className="text-xs text-slate-400 mb-3">
                    Current balance: <span className="font-semibold text-slate-600">{fmt(selectedChild.balance)}</span>
                  </p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => doTransaction('deposit')}
                    className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
                    style={{ background: 'linear-gradient(135deg, #1D9E75, #0F6E56)' }}>
                    <Plus className="w-3.5 h-3.5" /> Add money
                  </button>
                  <button onClick={() => doTransaction('withdraw')}
                    className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 active:scale-[0.98] transition-all">
                    <Minus className="w-3.5 h-3.5" /> Remove money
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <h2 className="text-sm font-semibold text-slate-800">All accounts</h2>
              </div>
              {children.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No children added yet.</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide pb-3 px-1">Child</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide pb-3 px-1">Balance</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide pb-3 px-1">Last move</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide pb-3 px-1">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {children.map(child => (
                        <tr key={child.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-1">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                style={{ background: AVATAR_BG[child.color % 7], color: AVATAR_FG[child.color % 7] }}>
                                {initials(child.name)}
                              </div>
                              <span className="text-sm font-medium text-slate-800">{child.name}</span>
                            </div>
                          </td>
                          <td className="text-right text-sm font-bold text-slate-900 py-3 px-1">{fmt(child.balance)}</td>
                          <td className="text-right py-3 px-1">
                            {child.last_change !== undefined && child.last_change !== 0 ? (
                              <span className={`text-xs font-semibold ${child.last_change >= 0 ? 'text-brand' : 'text-red-500'}`}>
                                {child.last_change >= 0 ? '+' : ''}{fmt(child.last_change)}
                              </span>
                            ) : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          <td className="text-right py-3 px-1">
                            <button onClick={() => removeChild(child.id)}
                              className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium transition-colors">
                              <Trash2 className="w-3 h-3" /> Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SIMULATE ── */}
        {activeTab === 'simulate' && (
          <div className="space-y-4">
            {/* Manual simulator */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-brand-light flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-brand" />
                </div>
                <h2 className="text-sm font-semibold text-slate-800">Manual simulator</h2>
              </div>
              <p className="text-xs text-slate-400 mb-5 ml-9">Jump ahead manually — simulate any number of market days at once.</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                {SIM_MODES.map(({ value, icon: Icon, label, desc, color, bg }) => (
                  <button key={value} onClick={() => setSimMode(value)}
                    className={`rounded-xl p-3 text-left border-2 transition-all ${
                      simMode === value ? 'shadow-sm scale-[1.02]' : 'border-transparent hover:border-slate-200'
                    }`}
                    style={{ background: bg, borderColor: simMode === value ? color : undefined }}>
                    <Icon className="w-4 h-4 mb-1.5" style={{ color }} />
                    <p className="text-sm font-semibold text-slate-800">{label}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </button>
                ))}
              </div>

              {simMode === 'custom' && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Custom percentage (e.g. -2.5)</label>
                  <input value={customPct} onChange={e => setCustomPct(e.target.value)} type="number" step="0.1" placeholder="e.g. -2.5"
                    className="w-36 h-10 px-3.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition" />
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button onClick={runSimDay} disabled={simRunning}
                  className="h-10 px-5 rounded-xl text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
                  style={{ background: 'linear-gradient(135deg, #1D9E75, #0F6E56)' }}>
                  {simRunning ? 'Running…' : 'Run 1 day'}
                </button>
                <button onClick={() => runSimDays(7)} disabled={simRunning}
                  className="h-10 px-4 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all">
                  Run 7 days
                </button>
                <button onClick={() => runSimDays(30)} disabled={simRunning}
                  className="h-10 px-4 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all">
                  Run 30 days
                </button>
              </div>

              {simMsg && (
                <div className="mt-4 flex items-center gap-2 bg-brand-light border border-brand/20 rounded-xl px-4 py-2.5">
                  <TrendingUp className="w-3.5 h-3.5 text-brand flex-shrink-0" />
                  <p className="text-xs font-medium text-brand-dark">{simMsg}</p>
                </div>
              )}
            </div>

            {/* Daily auto-update */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-800">Daily auto-update</h2>
                </div>
                {/* Enabled toggle */}
                <button onClick={() => setConfigDraft(d => ({ ...d, enabled: !d.enabled }))}
                  className="flex items-center gap-1.5 text-sm font-semibold transition-colors"
                  style={{ color: configDraft.enabled ? '#1D9E75' : '#94A3B8' }}>
                  {configDraft.enabled
                    ? <><ToggleRight className="w-6 h-6" /> On</>
                    : <><ToggleLeft className="w-6 h-6" /> Off</>}
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-5 ml-9">
                Every midnight UTC, a random amount is added or removed from each account within your set range.
                When you open the app, any missed days catch up automatically.
              </p>

              {/* Mode selector */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Update type</p>
                <div className="flex gap-2">
                  {(['percent', 'amount'] as const).map(m => (
                    <button key={m} onClick={() => setConfigDraft(d => ({
                      ...d, mode: m,
                      min_val: m === 'percent' ? -0.15 : -0.10,
                      max_val: m === 'percent' ?  0.15 :  0.25,
                    }))}
                      className={`h-9 px-4 rounded-xl text-sm font-semibold border-2 transition-all ${
                        configDraft.mode === m
                          ? 'border-brand bg-brand-light text-brand-dark'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                      {m === 'percent' ? '% per day' : '$ per day'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Range inputs */}
              <div className="mb-5">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Daily range</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 w-6">Min</label>
                    <input
                      type="number" step="0.01"
                      value={configDraft.min_val}
                      onChange={e => setConfigDraft(d => ({ ...d, min_val: parseFloat(e.target.value) || 0 }))}
                      className="w-24 h-9 px-3 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                    />
                    <span className="text-xs text-slate-400">{configDraft.mode === 'percent' ? '%' : '$'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 w-6">Max</label>
                    <input
                      type="number" step="0.01"
                      value={configDraft.max_val}
                      onChange={e => setConfigDraft(d => ({ ...d, max_val: parseFloat(e.target.value) || 0 }))}
                      className="w-24 h-9 px-3 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                    />
                    <span className="text-xs text-slate-400">{configDraft.mode === 'percent' ? '%' : '$'}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {configDraft.mode === 'percent'
                    ? `Each day randomly picks a % between ${configDraft.min_val}% and ${configDraft.max_val}% and applies it to every balance.`
                    : `Each day randomly picks an amount between ${configDraft.min_val < 0 ? '-' : ''}$${Math.abs(configDraft.min_val)} and $${configDraft.max_val} and adds it to every balance.`}
                </p>
              </div>

              {/* Last ran + save */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-slate-400">
                  {simConfig.last_run_date
                    ? <>Last ran: <span className="font-medium text-slate-600">{new Date(simConfig.last_run_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></>
                    : 'Never run yet'}
                </p>
                <button onClick={saveSimConfig} disabled={configSaving || !isDirty}
                  className={`flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold transition-all ${
                    configSaved
                      ? 'bg-brand-light text-brand border border-brand/20'
                      : isDirty
                        ? 'text-white hover:opacity-90 active:scale-[0.98]'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                  style={isDirty && !configSaved ? { background: 'linear-gradient(135deg, #1D9E75, #0F6E56)' } : {}}>
                  <Save className="w-3.5 h-3.5" />
                  {configSaving ? 'Saving…' : configSaved ? 'Saved!' : 'Save settings'}
                </button>
              </div>
            </div>

            {/* Post-sim balances */}
            {children.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {children.map(child => (
                  <div key={child.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: AVATAR_BG[child.color % 7], color: AVATAR_FG[child.color % 7] }}>
                        {initials(child.name)}
                      </div>
                      <span className="text-sm font-semibold text-slate-800">{child.name}</span>
                    </div>
                    <p className="text-xl font-bold text-slate-900">{fmt(child.balance)}</p>
                    {child.last_change !== undefined && child.last_change !== 0 && (
                      <p className={`text-xs font-semibold mt-1 ${child.last_change >= 0 ? 'text-brand' : 'text-red-500'}`}>
                        {child.last_change >= 0 ? '+' : ''}{fmt(child.last_change)} last move
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
