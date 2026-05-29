// ── 1. MAINLAYOUT EXPORTED AS A NAMED EXPORT ──
export function MainLayout({
  sidebar,
  header,
  children
}) {
  return (
    <div className="flex h-screen bg-slate-100">
      
      {/* SIDEBAR CONTAINER */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col select-none">
        <div className="p-5 border-b border-slate-700">
          <h1 className="text-2xl font-bold">
            Simulador-dos
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Operations Training
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sidebar}
        </div>
      </aside>

      {/* MAIN VIEW */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOPBAR */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm select-none">
          {header}
        </header>

        {/* CONTENT REGION */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

// ── 2. SIDEBAR EXPORTED AS THE DEFAULT EXPORT ──
export default function Sidebar({
  activeView,
  onViewChange
}) {
  // Added select-none to ensure text remains unselected on rapid clicks
  const itemClass = view =>
    `w-full text-left px-4 py-3 rounded-lg transition select-none ${
      activeView === view
        ? 'bg-slate-800 font-medium text-white'
        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    }`;

  return (
    <div className="p-4 space-y-2">

      <button
        onClick={() => onViewChange('operations')}
        className={itemClass('operations')}
      >
        Operations
      </button>

      <button
        onClick={() => onViewChange('customers')}
        className={itemClass('customers')}
      >
        Customers
      </button>

      <button
        onClick={() => onViewChange('games')}
        className={itemClass('games')}
      >
        Games
      </button>

      <button
        onClick={() => onViewChange('reports')}
        className={itemClass('reports')}
      >
        Reports
      </button>

    </div>
  );
}