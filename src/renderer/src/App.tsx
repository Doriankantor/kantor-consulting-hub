import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { UpdateProvider } from './contexts/UpdateContext'
import Login     from './pages/Login'
import Setup     from './pages/Setup'
import FirstLogin from './pages/FirstLogin'
import Dashboard    from './pages/Dashboard'
import Settings     from './pages/Settings'
import Team         from './pages/Team'
import Workspace    from './pages/Workspace'
import Inbox        from './pages/Inbox'
import Contacts     from './pages/Contacts'
import Analytics    from './pages/Analytics'
import Trash        from './pages/Trash'
import TeamCalendar from './pages/TeamCalendar'
import Files        from './pages/Files'
import Todo         from './pages/Todo'
import Intelligence from './pages/Intelligence'
import InfoPages    from './pages/InfoPages'
import Layout       from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import ChatPanel    from './components/ChatPanel'

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

function AppRoutes() {
  const { session, localUser, loading, needsSetup, mustChangePassword } = useAuth()
  const isAuthenticated = !!session || !!localUser

  if (loading) return <Loader />

  if (!isAuthenticated) return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )

  if (mustChangePassword) return <FirstLogin />

  if (needsSetup) return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="*" element={<Navigate to="/setup" replace />} />
    </Routes>
  )

  return (
    <UpdateProvider>
    <WorkspaceProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/inbox"     element={<Inbox />} />
          <Route path="/todo"      element={<Todo />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/workspace"  element={<ErrorBoundary label="Workspace"><Workspace /></ErrorBoundary>} />
          <Route path="/files"     element={<Files />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/info-pages"   element={<InfoPages />} />
          <Route path="/contacts"  element={<Contacts />} />
          <Route path="/calendar"  element={<TeamCalendar />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/team"      element={<Team />} />
          <Route path="/settings"  element={<Settings />} />
          <Route path="/trash"     element={<Trash />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <ChatPanel />
    </WorkspaceProvider>
    </UpdateProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </HashRouter>
    </ThemeProvider>
  )
}
