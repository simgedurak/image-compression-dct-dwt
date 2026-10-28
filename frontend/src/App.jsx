import { useEffect, useState } from 'react'
import { Images, GitBranch, ScanFace, Grid2x2, CircleDot } from 'lucide-react'
import { AppProvider } from './context/AppContext'
import Sidebar from './components/Sidebar'
import ComparisonLab from './components/tabs/ComparisonLab'
import SubbandTreeCanvas from './components/tabs/SubbandTreeCanvas'
import SemanticRoiLab from './components/tabs/SemanticRoiLab'
import BlockInspector from './components/tabs/BlockInspector'
import { checkHealth } from './api/client'

const TABS = [
  { id: 'compare', label: 'Comparison Lab', icon: Images, Component: ComparisonLab },
  { id: 'subband-tree', label: 'Subband Tree Canvas', icon: GitBranch, Component: SubbandTreeCanvas },
  { id: 'semantic-roi', label: 'Semantic ROI Lab', icon: ScanFace, Component: SemanticRoiLab },
  { id: 'block-inspector', label: '8×8 Block Inspector', icon: Grid2x2, Component: BlockInspector },
]

function BackendStatus() {
  const [status, setStatus] = useState('checking') // 'checking' | 'up' | 'down'

  useEffect(() => {
    let cancelled = false
    checkHealth()
      .then(() => !cancelled && setStatus('up'))
      .catch(() => !cancelled && setStatus('down'))
    return () => {
      cancelled = true
    }
  }, [])

  const color = status === 'up' ? 'text-emerald-500' : status === 'down' ? 'text-red-500' : 'text-slate-300'
  const label = status === 'up' ? 'Backend connected' : status === 'down' ? 'Backend unreachable' : 'Checking backend…'

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
      <CircleDot size={12} className={color} />
      {label}
    </div>
  )
}

function AppShell() {
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const Active = TABS.find((t) => t.id === activeTab)?.Component ?? ComparisonLab

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
          <nav className="flex gap-1 overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
          <BackendStatus />
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Active />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
