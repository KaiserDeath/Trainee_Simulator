import { useParams } from 'react-router-dom'

export default function DashboardPage() {
  const { sessionId } = useParams()

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">

      <h1 className="text-3xl font-bold mb-4">
        Operations Dashboard
      </h1>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">

        <p className="text-zinc-400 mb-2">
          Active Session
        </p>

        <p className="text-green-400">
          {sessionId}
        </p>

      </div>

    </div>
  )
}