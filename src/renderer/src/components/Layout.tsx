import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import SyncStatus from './SyncStatus'
import UpdateBanner from './UpdateBanner'

export default function Layout() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      <UpdateBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
          <div className="shrink-0 border-t border-black/[0.06] dark:border-white/[0.08]">
            <SyncStatus />
          </div>
        </main>
      </div>
    </div>
  )
}
