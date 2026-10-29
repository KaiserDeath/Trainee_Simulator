export default function MainLayout({
  sidebar,
  header,
  children
}) {
  return (
    <div className="flex h-screen bg-white font-[Outfit,Inter,system-ui,sans-serif] text-[14px] text-[#1c2338]">

      {/* SIDEBAR */}
      <aside className="flex w-[260px] shrink-0 flex-col bg-[#1b2036] text-[#c9cee0] select-none">

        <div className="flex items-center justify-between px-[18px] pt-5 pb-[18px]">
          <span className="text-[22px] font-semibold tracking-[2px] text-white">
            &lt;BACK-END&gt;
          </span>
        </div>

        <div className="mx-[18px] mb-[22px] flex items-center gap-2.5 rounded-xl border border-[#333b5a] bg-[#252b45] p-3">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-gradient-to-br from-[#6d6fe0] to-[#8a5fc9] font-semibold text-white">
            S
          </span>
          <div>
            <small className="block text-[10px] tracking-[.5px] text-[#8a93a8]">YOUR COMPANY</small>
            <span className="font-semibold text-white">Simulador-dos</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sidebar}
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* TOPBAR */}
        <header className="z-10 flex h-[70px] items-center justify-between border-b border-[#e8eaf2] bg-[#fbfbff] px-8 select-none">
          {header}
        </header>

        {/* CONTENT */}
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
