import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks'
import { Sidebar, Header, AnalyticsDashboard, WorkspaceSelector, RoleManager, IntegrationManager } from './components'

// 簡單頁面組件
const LoginPage = () => (
  <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-slate-900 mb-2">🎯 Session Wrap</h1>
      <p className="text-slate-600 mb-8">Connecting to auth service...</p>
      <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  </div>
)

const HomePage = () => (
  <div className="p-8 max-w-6xl mx-auto">
    <h1 className="text-3xl font-bold text-slate-900 mb-4">Welcome to Session Wrap</h1>
    <div className="grid grid-cols-3 gap-6 mt-8">
      <div className="card">
        <h3 className="text-lg font-semibold mb-2">📊 Analytics</h3>
        <p className="text-slate-600">Track task completion, decision quality, and agent performance.</p>
      </div>
      <div className="card">
        <h3 className="text-lg font-semibold mb-2">👥 Workspace Management</h3>
        <p className="text-slate-600">Manage team members and control access with role-based permissions.</p>
      </div>
      <div className="card">
        <h3 className="text-lg font-semibold mb-2">⚡ Integrations</h3>
        <p className="text-slate-600">Connect with Slack, GitHub, and Jira to enhance your workflow.</p>
      </div>
    </div>
  </div>
)

const SettingsPage = () => (
  <div className="p-8 max-w-4xl mx-auto">
    <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>
    <div className="card space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Preferences</h3>
        <p className="text-slate-600">Settings coming soon...</p>
      </div>
    </div>
  </div>
)

interface AppLayoutProps {
  isAuthenticated: boolean
  children: React.ReactNode
}

const AppLayout = ({ isAuthenticated, children }: AppLayoutProps) => {
  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoginPage />
  }

  return (
    <AppLayout isAuthenticated={isAuthenticated}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<AnalyticsDashboard />} />
        <Route path="/workspaces" element={<WorkspaceSelector />} />
        <Route path="/roles" element={<RoleManager />} />
        <Route path="/integrations" element={<IntegrationManager />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AppLayout>
  )
}
