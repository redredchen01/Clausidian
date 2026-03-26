import React, { useState, useEffect } from 'react'
import { DashboardState } from './types'
import { apiClient } from './api'
import TaskBoard from './components/TaskBoard'
import DecisionTimeline from './components/DecisionTimeline'
import MemoryStats from './components/MemoryStats'
import SyncStatus from './components/SyncStatus'
import './App.css'

function App() {
  const [state, setState] = useState<DashboardState>({
    tasks: [],
    decisions: [],
    memory: [],
    sync: {
      last_sync: new Date().toISOString(),
      status: 'syncing',
      agent_count: 0,
      active_agents: [],
    },
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'decisions' | 'memory'>('overview')

  useEffect(() => {
    const loadState = async () => {
      setLoading(true)
      try {
        const newState = await apiClient.getDashboardState()
        setState(newState)
      } catch (error) {
        console.error('Failed to load dashboard state:', error)
      } finally {
        setLoading(false)
      }
    }

    // Load initial state
    loadState()

    // Subscribe to updates every 5 seconds
    const unsubscribe = apiClient.subscribeToUpdates((newState) => {
      setState(newState)
    }, 5000)

    return () => {
      clearInterval(unsubscribe)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Session Wrap Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">Multi-agent project coordination & memory management</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">
                {state.sync.status === 'synced' ? '✅ Connected' : '⚠️ ' + state.sync.status}
              </p>
              <p className="text-xs text-gray-500 mt-1">Last sync: {new Date(state.sync.last_sync).toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-8" role="tablist">
            {(['overview', 'tasks', 'decisions', 'memory'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                <SyncStatus status={state.sync} />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Total Tasks</p>
                    <p className="text-4xl font-bold text-gray-900 mt-2">{state.tasks.length}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {state.tasks.filter(t => t.status === 'completed').length} completed
                    </p>
                  </div>
                  <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Decisions Made</p>
                    <p className="text-4xl font-bold text-gray-900 mt-2">{state.decisions.length}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {state.decisions.slice(0, 1)[0]?.date ? 'Latest: ' + new Date(state.decisions[0].date).toLocaleDateString() : 'No decisions yet'}
                    </p>
                  </div>
                  <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Agents Active</p>
                    <p className="text-4xl font-bold text-gray-900 mt-2">{state.sync.agent_count}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {state.sync.active_agents.join(', ') || 'None online'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tasks Tab */}
            {activeTab === 'tasks' && <TaskBoard tasks={state.tasks} />}

            {/* Decisions Tab */}
            {activeTab === 'decisions' && <DecisionTimeline decisions={state.decisions} />}

            {/* Memory Tab */}
            {activeTab === 'memory' && <MemoryStats stats={state.memory} />}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-sm text-gray-600">
          <p>Session Wrap v3.4.0 • Real-time multi-agent coordination dashboard</p>
        </div>
      </footer>
    </div>
  )
}

export default App
