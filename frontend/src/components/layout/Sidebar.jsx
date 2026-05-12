export default function Sidebar() {
  return (
    <div className="p-4 space-y-2">

      <button className="w-full text-left px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 transition">
        Dashboard
      </button>

      <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-800 transition">
        Operations
      </button>

      <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-800 transition">
        Customers
      </button>

      <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-800 transition">
        Reports
      </button>

    </div>
  );
}