import MainLayout from '../components/layout/MainLayout';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import OperationsQueue from '../components/operations/OperationsQueue';
import PerformancePanel from '../components/performance/PerformancePanel';

export default function TrainerPage({
  session
}) {

  return (
    <MainLayout
      sidebar={<Sidebar />}
      header={
        <Header
          traineeName={
            session?.trainee_name
          }
        />
      }
    >

      <div className="grid grid-cols-3 gap-6">

        {/* OPERATIONS */}
        <div className="col-span-2 bg-white rounded-2xl shadow p-5">

          <h3 className="text-lg font-semibold mb-4">
            Live Operations Queue
          </h3>

          <OperationsQueue
            session={session}
            />
        </div>

        {/* PERFORMANCE */}
        <div className="bg-white rounded-2xl shadow p-5">

          <PerformancePanel
            session={session}
            />

        </div>

      </div>

    </MainLayout>
  );
}