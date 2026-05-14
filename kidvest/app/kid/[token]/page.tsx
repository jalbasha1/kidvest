'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Star, Sparkles, ArrowUpRight, Target } from 'lucide-react'

const AVATAR_BG = ['#E1F5EE','#E6F1FB','#FAECE7','#F0E9FD','#FAEEDA','#FBEAF0','#EAF3DE']
const AVATAR_FG = ['#0F6E56','#185FA5','#993C1D','#5B3EA6','#854F0B','#993556','#3B6D11']
const COLORS    = ['#1D9E75','#378ADD','#D85A30','#8B5CF6','#E5850A','#D4537E','#639922']
const GRAD_END  = ['#34c993','#5ba3e8','#e87a55','#a78bfa','#f0a832','#e07fa0','#85bf3c']

type Child = { id: string; name: string; balance: number; color: number }
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
  deposit:  { label: 'Deposit',      bg: '#ECFDF5', text: '#0F6E56', icon: TrendingUp   },
  withdraw: { label: 'Withdrawal',   bg: '#FEF2F2', text: '#B91C1C', icon: TrendingDown },
  gain:     { label: 'Market Gain',  bg: '#ECFDF5', text: '#0F6E56', icon: TrendingUp   },
  loss:     { label: 'Market Loss',  bg: '#FEF2F2', text: '#B91C1C', icon: TrendingDown },
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

function motivationalMessage(totalPct: number, name: string): { text: string; sub: string } {
  const first = name.split(' ')[0]
  if (totalPct > 20) return { text: `Amazing growth, ${first}! 🚀`, sub: "You're a super investor!" }
  if (totalPct > 10) return { text: `Nice work, ${first}! 📈`, sub: "Your money is really growing." }
  if (totalPct > 0)  return { text: `Keep it up, ${first}! 🌱`, sub: "Every bit of growth counts." }
  if (totalPct === 0) return { text: `Ready to grow, ${first}? 💰`, sub: "Your investment journey begins!" }
  return { text: `Stay patient, ${first}! ⏳`, sub: "Markets go up and down — keep holding!" }
}

export default function KidView() {
  const params = useParams()
  const token = params.token as string

  const [child, setChild] = useState<Child | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/kid?token=${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ child, transactions, history, goals }) => {
        setChild(child)
        setTransactions(transactions)
        setHistory(history)
        setGoals(goals || [])
        setLoading(false)
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [token])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0FDF8' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center animate-pulse"
          style={{ background: 'linear-gradient(135deg, #1D9E75, #34c993)' }}>
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <p className="text-sm font-medium text-emerald-600">Loading your money…</p>
      </div>
    </div>
  )

  if (notFound || !child) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-sm px-6">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Star className="w-8 h-8 text-slate-300" />
        </div>
        <p className="text-slate-700 font-semibold text-lg">Page not found</p>
        <p className="text-slate-400 text-sm mt-2">Ask your parent for the right link.</p>
      </div>
    </div>
  )

  const idx = child.color % 7
  const accent = COLORS[idx]
  const gradEnd = GRAD_END[idx]
  const startBalance = history.length > 0 ? history[0].balance : child.balance
  const totalGain = child.balance - startBalance
  const totalPct  = startBalance > 0 ? (totalGain / startBalance * 100) : 0
  const msg = motivationalMessage(totalPct, child.name)

  const chartData = history.map((h, i) => ({
    label: i === 0 ? 'Start' : `Day ${i}`,
    balance: h.balance,
  }))

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #F0FDF8 0%, #F8FAFC 40%)' }}>
      {/* Top bar */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1D9E75, #34c993)' }}>
            <TrendingUp className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-slate-800 tracking-tight text-sm">KidVest</span>
        </div>
        <span className="text-xs text-slate-400">My Account</span>
      </div>

      <div className="max-w-sm mx-auto px-4 pb-10 space-y-4">
        {/* Hero card */}
        <div className="rounded-3xl p-6 text-white relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${AVATAR_FG[idx]} 0%, ${accent} 55%, ${gradEnd} 100%)` }}>
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/8 pointer-events-none" />

          <div className="relative">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black mb-4 ring-4 ring-white/20"
              style={{ background: 'rgba(255,255,255,0.2)' }}>
              {initials(child.name)}
            </div>
            <p className="text-white/80 text-sm font-medium mb-0.5">{child.name}&apos;s account</p>
            <p className="text-white/70 text-xs mb-3">My current balance</p>
            <p className="text-5xl font-black tracking-tight leading-none mb-4">
              {fmt(child.balance)}
            </p>

            {/* Gain pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold"
              style={{ background: totalGain >= 0 ? 'rgba(255,255,255,0.25)' : 'rgba(239,68,68,0.3)' }}>
              {totalGain >= 0
                ? <><ArrowUpRight className="w-3.5 h-3.5" />{totalPct > 0 ? `+${totalPct.toFixed(1)}%` : 'Getting started'}</>
                : <><TrendingDown className="w-3.5 h-3.5" />{totalPct.toFixed(1)}%</>
              }
            </div>
          </div>
        </div>

        {/* Motivational message */}
        <div className="bg-white rounded-2xl border border-emerald-100 p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${accent}20` }}>
            <Sparkles className="w-5 h-5" style={{ color: accent }} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{msg.text}</p>
            <p className="text-xs text-slate-400 mt-0.5">{msg.sub}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-400 font-medium mb-1">Total earned</p>
            <p className={`text-2xl font-black ${totalGain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {totalGain >= 0 ? '+' : ''}{fmt(totalGain)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
            <p className="text-xs text-slate-400 font-medium mb-1">Transactions</p>
            <p className="text-2xl font-black text-slate-800">{transactions.length}</p>
          </div>
        </div>

        {/* Savings Goals */}
        {goals.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${accent}20` }}>
                <Target className="w-4 h-4" style={{ color: accent }} />
              </div>
              <p className="text-sm font-bold text-slate-800">My savings goals</p>
            </div>
            <div className="space-y-4">
              {goals.map(goal => {
                const pct = Math.min(100, (child.balance / goal.target_amount) * 100)
                const reached = child.balance >= goal.target_amount
                const remaining = Math.max(0, goal.target_amount - child.balance)
                return (
                  <div key={goal.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-800">{goal.name}</span>
                        {reached && <span className="text-xs">🎉</span>}
                      </div>
                      <span className="text-xs font-semibold" style={{ color: reached ? accent : '#64748B' }}>
                        {reached ? 'Goal reached!' : `${fmt(remaining)} to go`}
                      </span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: reached
                            ? `linear-gradient(90deg, ${accent}, ${gradEnd})`
                            : `linear-gradient(90deg, ${accent}99, ${accent})`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-slate-400">{fmt(Math.min(child.balance, goal.target_amount))} saved</span>
                      <span className="text-[10px] text-slate-400">Goal: {fmt(goal.target_amount)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Chart */}
        {chartData.length > 1 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-800 mb-1">My balance over time</p>
            <p className="text-xs text-slate-400 mb-4">Watch your money grow! 📈</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="kid-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={accent} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={accent} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 5) - 1)} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false}
                  tickFormatter={v => '$' + v.toLocaleString()} width={60} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: 12 }}
                  formatter={(v: number) => [fmt(v), 'Balance']}
                  labelStyle={{ color: '#64748B', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="balance"
                  stroke={accent} strokeWidth={3}
                  fill="url(#kid-grad)"
                  dot={false} activeDot={{ r: 6, strokeWidth: 0, fill: accent }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Transactions */}
        {transactions.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-800 mb-4">Recent activity</p>
            <div className="space-y-2.5">
              {transactions.slice(0, 10).map(tx => {
                const isPositive = tx.type === 'deposit' || tx.type === 'gain'
                return (
                  <div key={tx.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <TxBadge type={tx.type} />
                      <span className="text-xs text-slate-500 truncate">{tx.note || tx.type}</span>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className={`text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isPositive ? '+' : '-'}{fmt(tx.amount)}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-300 pt-2">Powered by KidVest · Learning to invest</p>
      </div>
    </div>
  )
}
