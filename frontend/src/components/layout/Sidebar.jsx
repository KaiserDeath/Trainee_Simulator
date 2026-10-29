import { useState } from 'react';

const OPERATION_VIEWS = ['movements', 'requests'];

const icons = {
  operations: (
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" />
  ),
  customers: (
    <path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a6 6 0 0 0-4-5.6" />
  ),
  games: (
    <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6L2 15a3 3 0 0 0 5.2 2.1L9 15h6l1.8 2.1A3 3 0 0 0 22 15l-.7-6.4a4 4 0 0 0-4-3.6" />
  ),
  reports: (
    <path d="M3 3v18h18M8 17v-5M13 17V8M18 17v-9" />
  ),
  chevron: <path d="M6 9l6 6 6-6" />
};

function Icon({ name, className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]}
    </svg>
  );
}

function Badge({ count }) {
  if (!count) return null;

  return (
    <span className="ml-auto rounded-full bg-[#3a4272] px-2 py-0.5 text-[11px] text-[#cfd6ff]">
      {count}
    </span>
  );
}

export default function Sidebar({
  activeView,
  onViewChange,
  counts = {}
}) {
  const [operationsOpen, setOperationsOpen] = useState(true);

  const itemClass = view =>
    `flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left text-[15px] transition select-none ${
      activeView === view
        ? 'bg-gradient-to-r from-[#4b8dff] to-[#13e0f5] font-semibold text-[#0b1226]'
        : 'text-[#c9cee0] hover:bg-[#252b45]'
    }`;

  const subItemClass = view =>
    `flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition select-none ${
      activeView === view
        ? 'border border-white bg-[#264a5e] font-semibold text-white'
        : 'text-[#b5bbd3] hover:bg-[#252b45]'
    }`;

  return (
    <nav className="space-y-1.5 px-[18px] pb-5">
      <button
        type="button"
        onClick={() => setOperationsOpen(open => !open)}
        aria-expanded={operationsOpen}
        className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left text-[15px] transition select-none hover:bg-[#252b45] ${
          OPERATION_VIEWS.includes(activeView) ? 'text-white' : 'text-[#c9cee0]'
        }`}
      >
        <Icon name="operations" />
        Operations
        <span className={`ml-auto transition-transform ${operationsOpen ? 'rotate-180' : ''}`}>
          <Icon name="chevron" className="h-3.5 w-3.5" />
        </span>
      </button>

      {operationsOpen && (
        <div className="mb-1.5 ml-[22px] space-y-1 border-l border-[#39405f] pl-3.5">
          <button
            type="button"
            onClick={() => onViewChange('movements')}
            className={subItemClass('movements')}
          >
            {activeView === 'movements' && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#13e0f5]" />
            )}
            New Movements
            <Badge count={counts.movements} />
          </button>
          <button
            type="button"
            onClick={() => onViewChange('requests')}
            className={subItemClass('requests')}
          >
            {activeView === 'requests' && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#13e0f5]" />
            )}
            Games Requests
            <Badge count={counts.requests} />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => onViewChange('customers')}
        className={itemClass('customers')}
      >
        <Icon name="customers" />
        Customers
      </button>

      <button
        type="button"
        onClick={() => onViewChange('games')}
        className={itemClass('games')}
      >
        <Icon name="games" />
        Games
      </button>

      <button
        type="button"
        onClick={() => onViewChange('reports')}
        className={itemClass('reports')}
      >
        <Icon name="reports" />
        Reports
      </button>
    </nav>
  );
}
