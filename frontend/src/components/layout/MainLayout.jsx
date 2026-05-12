export default function MainLayout({
  sidebar,
  header,
  children
}) {
  return (
    <div className="flex h-screen bg-slate-100">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        
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

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* TOPBAR */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm">
          {header}
        </header>

        {/* CONTENT */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}