import { useState } from 'react';

import MainLayout from '../components/layout/MainLayout';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import OperationsQueue from '../components/operations/OperationsQueue';
import PerformancePanel from '../components/performance/PerformancePanel';
import CustomerPanel from '../components/customers/CustomerPanel';
import GamesLauncher from '../components/games/GamesLauncher';

export default function TrainerPage({
  session
}) {
  const [activeView, setActiveView] =
    useState('operations');

  return (
    <MainLayout
      sidebar={
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
        />
      }
      header={
        <Header
          traineeName={
            session?.trainee_name
          }
        />
      }
    >

      {activeView === 'operations' && (
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
      )}

      {activeView === 'customers' && (
        <CustomerPanel
          session={session}
        />
      )}

      {activeView === 'games' && (
        <GamesLauncher
          session={session}
        />
      )}

      {activeView === 'reports' && (
        <div className="bg-white rounded-2xl shadow p-5">
          <PerformancePanel
            session={session}
          />
        </div>
      )}

    </MainLayout>
  );
}
