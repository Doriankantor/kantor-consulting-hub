import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import SyncStatus from './SyncStatus'

export default function Layout() {
  return (
    <div className="h-screen flex flex-col bg-slate-100 dark:bg-hub-navy overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden bg-slate-100 dark:bg-hub-navy/80 flex flex-col">
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
          <div className="shrink-0 border-t border-black/[0.05] dark:border-white/[0.04]">
            <SyncStatus />
          </div>
        </main>
      </div>
    </div>
  )
}
