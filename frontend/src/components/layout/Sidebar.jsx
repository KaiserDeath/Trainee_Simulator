export default function Sidebar({
  activeView,
  onViewChange
}) {
  const itemClass = view =>
    `w-full text-left px-4 py-3 rounded-lg transition ${
      activeView === view
        ? 'bg-slate-800'
        : 'hover:bg-slate-800'
    }`;

  return (
    <div className="p-4 space-y-2">

      <button
        onClick={() =>
          onViewChange('operations')
        }
        className={itemClass('operations')}
      >
        Operations
      </button>

      <button
        onClick={() =>
          onViewChange('customers')
        }
        className={itemClass('customers')}
      >
        Customers
      </button>

      <button
        onClick={() =>
          onViewChange('games')
        }
        className={itemClass('games')}
      >
        Games
      </button>

      <button
        onClick={() =>
          onViewChange('reports')
        }
        className={itemClass('reports')}
      >
        Reports
      </button>

    </div>
  );
}
