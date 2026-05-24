import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Team from './pages/Team'
import Workspace from './pages/Workspace'
import Layout from './components/Layout'

// ── Loader ────────────────────────────────────────────────────────────────

function Loader() {
  return (
    <div className="h-screen flex items-center justify-center bg-hub-navy">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-[3px] border-hub-gold/20 border-t-hub-gold rounded-full animate-spin" />
        <p className="text-white/30 text-sm">Loading…</p>
      </div>
    </div>
  )
}

// ── Route guard ───────────────────────────────────────────────────────────

function AppRoutes() {
  const { session, localUser, loading, needsSetup } = useAuth()
  const isAuthenticated = !!session || !!localUser

  if (loading) return <Loader />

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (needsSetup) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }

  return (
    // WorkspaceProvider wraps all authenticated routes so Sidebar can access workspace state
    <WorkspaceProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/workspace"  element={<Workspace />} />
          <Route path="/team"       element={<Team />} />
          <Route path="/settings"   element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </WorkspaceProvider>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
