'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import {
  ArrowLeft, TrendingUp, TrendingDown, Shuffle, PencilLine,
  ToggleLeft, ToggleRight, Clock, Zap,
} from 'lucide-react'

type Child = { id: string; name: string; balance: number; color: number }
type SimConfig = { enabled: boolean; last_run_date: string | null }

const SIM_MODES = [
  { value: 'random', icon: Shuffle,      label: 'Random',  desc: 'Up or down',   color: '#64748B', bg: '#F1F5F9' },
  { value: 'bull',   icon: TrendingUp,   label: 'Bull',    desc: 'Positive day', color: '#1D9E75', bg: '#ECFDF5' },
  { value: 'bear',   icon: TrendingDown, label: 'Bear',    desc: 'Negative day', color: '#EF4444', bg: '#FEF2F2' },
  { value: 'custom', icon: PencilLine,   label: 'Custom',  desc: 'Set your %',   color: '#8B5CF6', bg: '#F5F3FF' },
]

function fmt(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SimulatorPage() {
  const router = useRouter()
  const [children, setChildren] = useState<Child[]>([])
  const [simConfig, setSimConfig] = useState<SimConfig>({ enabled: false, last_run_date: null })
  const [parentId, setParentId] = useState('')
  const [simMode, setSimMode] = useState('random')
  const [customPct, setCustomPct] = useState('')
  const [simMsg, setSimMsg] = useState('')
  const [simRunning, setSimRunning] = useState(false)
  const [globalSaving, setGlobalSaving] = useState(false)
  const [globalSaved, setGlobalSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setParentId(session.user.id)

    const [{ data: childData }, { data: cfgData }] = await Promise.all([
      supabase.from('children').select('id, name, balance, color').order('created_at', { ascending: true }),
      supabase.from('sim_config').select('enabled, last_run_date').eq('parent_id', session.user.id).maybeSingle(),
    ])
    setChildren(childData || [])
    if (cfgData) setSimConfig(cfgData)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  function randomPct(mode: string) {
    if (mode === 'bull') return Math.random() * 3 + 0.5
    if (mode === 'bear') return -(Math.random() * 3 + 0.5)
    return Math.random() < 0.5 ? Math.random() * 4 : -(Math.random() * 4)
  }

  async function runSimDays(n: number) {
    if (!children.length) return
    setSimRunning(true)
    setSimMsg('')
    let lastPct = 0
    for (let i = 0; i < n; i++) {
      const pct = simMode === 'custom' ? parseFloat(customPct) : randomPct(simMode)
      if (isNaN(pct)) continue
      lastPct = pct
      for (const child of children) {
        const change = parseFloat((child.balance * pct / 100).toFixed(2))
        const newBal = Math.max(0, parseFloat((child.balance + change).toFixed(2)))
        child.balance = newBal
        await supabase.from('children').update({ balance: newBal }).eq('id', child.id)
        await supabase.from('transactions').insert({ child_id: child.id, type: pct >= 0 ? 'gain' : 'loss', amount: Math.abs(change), note: `Market ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` })
        await supabase.from('balance_history').insert({ child_id: child.id, balance: newBal })
      }
    }
    setSimMsg(n === 1
      ? `Market day: ${lastPct >= 0 ? '+' : ''}${lastPct.toFixed(2)}% applied to all accounts`
      : `Simulated ${n} market days`)
    setSimRunning(false)
    load()
  }

  async function saveGlobalConfig(enabled: boolean) {
    if (!parentId) return
    setGlobalSaving(true)
    const { data } = await supabase
      .from('sim_config')
      .upsert({ parent_id: parentId, enabled }, { onConflict: 'parent_id' })
      .select().maybeSingle()
    if (data) setSimConfig({ enabled: data.enabled, last_run_date: data.last_run_date })
    setGlobalSaving(false)
    setGlobalSaved(true)
    setTimeout(() => setGlobalSaved(false), 2000)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: '#1D9E75' }}>
          <Zap className="w-5 h-5 text-white" />
        </div>
        <p className="text-sm text-slate-400">Loading simulator…</p>
      </div>
    </div>
  )

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

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1D9E75, #0F6E56)' }}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Market Simulator</h1>
          </div>
          <p className="text-sm text-slate-400 ml-10.5">
            Test market scenarios and fast-forward time — changes are real and show up in each child&apos;s history.
          </p>
        </div>

        {children.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-card">
            <p className="text-sm text-slate-400">Add children from the dashboard to use the simulator.</p>
            <Link href="/dashboard" className="mt-3 inline-block text-sm font-semibold text-brand hover:text-brand-dark">
              ← Back to dashboard
            </Link>
          </div>
        )}

        {children.length > 0 && (
          <>
            {/* Manual simulator */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
              <h2 className="text-sm font-semibold text-slate-800 mb-1">Manual run</h2>
              <p className="text-xs text-slate-400 mb-5">Pick a scenario and simulate any number of market days at once.</p>

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
                <button onClick={() => runSimDays(1)} disabled={simRunning}
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800">Daily auto-update</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {simConfig.last_run_date
                        ? `Last ran ${new Date(simConfig.last_run_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : 'Runs every midnight UTC · never run yet'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => saveGlobalConfig(!simConfig.enabled)}
                  disabled={globalSaving}
                  className="flex items-center gap-1.5 text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ color: simConfig.enabled ? '#1D9E75' : '#94A3B8' }}>
                  {simConfig.enabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                  <span>{globalSaving ? '…' : globalSaved ? 'Saved!' : simConfig.enabled ? 'On' : 'Off'}</span>
                </button>
              </div>
              {simConfig.enabled && (
                <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
                  Each child&apos;s daily range is configured on their detail page. Children with auto-update paused are skipped.
                </p>
              )}
            </div>

            {/* Accounts that will be affected */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Affected accounts</p>
              <div className="space-y-2">
                {children.map(child => (
                  <div key={child.id} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{child.name}</span>
                    <span className="text-sm font-semibold text-slate-900">{fmt(child.balance)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
