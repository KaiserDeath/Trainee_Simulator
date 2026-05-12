export default function Header({
  traineeName
}) {
  return (
    <div className="w-full flex items-center justify-between">

      <div>
        <h2 className="text-xl font-semibold text-slate-800">
          Operations Dashboard
        </h2>

        <p className="text-sm text-slate-500">
          Live Training Session
        </p>
      </div>

      <div className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow">
        Trainee: {traineeName}
      </div>

    </div>
  );
}