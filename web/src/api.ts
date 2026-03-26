import axios, { AxiosInstance } from 'axios'
import type { Task, Decision, MemoryStat, SyncStatus, DashboardState } from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

class APIClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    try {
      const res = await this.client.get('/tasks')
      return res.data.tasks || []
    } catch {
      console.error('Failed to fetch tasks')
      return []
    }
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<void> {
    await this.client.patch(`/tasks/${id}`, updates)
  }

  // Decisions
  async getDecisions(): Promise<Decision[]> {
    try {
      const res = await this.client.get('/decisions')
      return res.data.decisions || []
    } catch {
      console.error('Failed to fetch decisions')
      return []
    }
  }

  // Memory stats
  async getMemoryStats(): Promise<MemoryStat[]> {
    try {
      const res = await this.client.get('/memory/stats')
      return res.data.stats || []
    } catch {
      console.error('Failed to fetch memory stats')
      return []
    }
  }

  // Sync status
  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const res = await this.client.get('/sync/status')
      return res.data.status || { last_sync: '', status: 'error', agent_count: 0, active_agents: [] }
    } catch {
      console.error('Failed to fetch sync status')
      return { last_sync: '', status: 'error', agent_count: 0, active_agents: [] }
    }
  }

  // Full dashboard state
  async getDashboardState(): Promise<DashboardState> {
    const [tasks, decisions, memory, sync] = await Promise.all([
      this.getTasks(),
      this.getDecisions(),
      this.getMemoryStats(),
      this.getSyncStatus(),
    ])

    return { tasks, decisions, memory, sync }
  }

  // Subscribe to real-time updates (polling fallback)
  subscribeToUpdates(callback: (state: DashboardState) => void, interval = 5000) {
    const poll = async () => {
      const state = await this.getDashboardState()
      callback(state)
    }

    poll()
    return setInterval(poll, interval)
  }
}

export const apiClient = new APIClient()
