import { useAnalytics, useWorkspace } from '../hooks'
import { TrendChart } from './TrendChart'
import { AgentLeaderboard } from './AgentLeaderboard'
import { Insight } from '../types'
import { AlertCircle, CheckCircle2, Zap } from 'lucide-react'

interface KPICardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  trend?: string
  color: 'blue' | 'green' | 'yellow' | 'purple'
}

const KPICard = ({ title, value, icon, trend, color }: KPICardProps) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600'
  }

  return (
    <div className={`${colorClasses[color]} rounded-lg p-6 flex items-start gap-4`}>
      <div className="text-3xl">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-600">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {trend && <p className="text-xs text-green-600 mt-2">{trend}</p>}
      </div>
    </div>
  )
}

const InsightCard = (insight: Insight) => {
  const iconMap = {
    positive: <CheckCircle2 size={18} className="text-green-600" />,
    warning: <AlertCircle size={18} className="text-yellow-600" />,
    info: <Zap size={18} className="text-blue-600" />
  }

  const bgMap = {
    positive: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200'
  }

  return (
    <div key={insight.message} className={`${bgMap[insight.type]} border rounded-lg p-4`}>
      <div className="flex gap-3">
        <div className="flex-shrink-0">{iconMap[insight.type]}</div>
        <div className="flex-1">
          <p className="font-medium text-slate-900">{insight.message}</p>
          <p className="text-sm text-slate-600 mt-1">{insight.recommendation}</p>
        </div>
      </div>
    </div>
  )
}

interface AnalyticsDashboardProps {
  workspaceId?: string | null
}

export const AnalyticsDashboard = ({ workspaceId }: AnalyticsDashboardProps) => {
  const { currentWorkspace } = useWorkspace()
  const wsId = workspaceId || currentWorkspace?.id
  const { dashboard, insights, agents, isLoading, error, days, setDays } = useAnalytics(wsId || null)

  if (!wsId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-slate-600">Please select a workspace</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-slate-600">No analytics data available</p>
        </div>
      </div>
    )
  }

  const completionRate = dashboard.completion_rate * 100

  return (
    <div className="p-6 space-y-6">
      {/* Header with Controls */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h1>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="input"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          title="Task Completion"
          value={`${completionRate.toFixed(1)}%`}
          icon="📊"
          color="blue"
          trend="+5% from last period"
        />
        <KPICard
          title="Total Tasks"
          value={dashboard.snapshot.total_tasks}
          icon="✓"
          color="green"
        />
        <KPICard
          title="Avg Decision Quality"
          value={dashboard.snapshot.avg_decision_quality.toFixed(2)}
          icon="⭐"
          color="purple"
          trend="Scale: 1-5"
        />
        <KPICard
          title="Active Agents"
          value={dashboard.snapshot.active_agents}
          icon="🤖"
          color="yellow"
        />
      </div>

      {/* Trends Chart */}
      {dashboard.trends.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Trends ({days} days)</h2>
          <TrendChart data={dashboard.trends} />
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-3 gap-6">
        {/* Agent Leaderboard */}
        {agents.length > 0 && (
          <div className="col-span-2 card">
            <h2 className="text-lg font-semibold mb-4">Top Agents</h2>
            <AgentLeaderboard agents={agents} />
          </div>
        )}

        {/* Insights */}
        <div className="card space-y-3">
          <h2 className="text-lg font-semibold">Key Insights</h2>
          {insights.length > 0 ? (
            insights.map((insight) => (
              <InsightCard key={insight.message} {...insight} />
            ))
          ) : (
            <p className="text-sm text-slate-500">No insights available</p>
          )}
        </div>
      </div>

      {/* Task Status Breakdown */}
      <div className="card grid grid-cols-4 gap-4">
        <div>
          <p className="text-sm text-slate-600">Completed</p>
          <p className="text-2xl font-bold text-green-600">
            {dashboard.snapshot.completed_tasks}
          </p>
        </div>
        <div>
          <p className="text-sm text-slate-600">In Progress</p>
          <p className="text-2xl font-bold text-blue-600">
            {dashboard.snapshot.in_progress_tasks}
          </p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">
            {dashboard.snapshot.pending_tasks}
          </p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Total Decisions</p>
          <p className="text-2xl font-bold text-purple-600">
            {dashboard.snapshot.total_decisions}
          </p>
        </div>
      </div>
    </div>
  )
}
