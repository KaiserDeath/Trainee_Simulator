import {
  useEffect,
  useState
} from 'react';

import api from '../../api/client';

export default function PerformancePanel({
  session
}) {

  const [report, setReport] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  //
  // FETCH REPORT
  //
  const fetchReport = async () => {

    try {

      const response = await api.get(`/trainer/sessions/${session.id}/report`)

      setReport(response.data);

    } catch (err) {

      console.error(
        'Failed to fetch report:',
        err
      );

    } finally {

      setLoading(false);

    }
  };

  //
  // AUTO REFRESH
  //
  useEffect(() => {

    fetchReport();

    const interval = setInterval(() => {

      fetchReport();

    }, 5000);

    return () =>
      clearInterval(interval);

  }, []);

  //
  // LOADING
  //
  if (loading) {

    return (
      <div className="text-slate-500">
        Loading metrics...
      </div>
    );
  }

  //
  // NO REPORT
  //
  if (!report) {

    return (
      <div className="text-slate-500">
        No report data
      </div>
    );
  }

  const stats =
    report.performance;

  return (
    <div>

      {/* TITLE */}
      <div className="mb-6">

        <h2 className="text-xl font-bold text-slate-800">
          Performance
        </h2>

        <p className="text-sm text-slate-500">
          Live trainee metrics
        </p>

      </div>

      {/* METRICS */}
      <div className="space-y-4">

        {/* ACCURACY */}
        <div className="bg-slate-50 border rounded-xl p-4">

          <p className="text-sm text-slate-500">
            Accuracy
          </p>

          <h3 className="text-3xl font-bold text-slate-800">
            {stats.accuracy}%
          </h3>

        </div>

        {/* TOTAL */}
        <div className="bg-slate-50 border rounded-xl p-4">

          <p className="text-sm text-slate-500">
            Total Operations
          </p>

          <h3 className="text-2xl font-bold text-slate-800">
            {stats.totalOperations}
          </h3>

        </div>

        {/* COMPLETED */}
        <div className="bg-slate-50 border rounded-xl p-4">

          <p className="text-sm text-slate-500">
            Completed
          </p>

          <h3 className="text-2xl font-bold text-green-600">
            {stats.completedOperations}
          </h3>

        </div>

        {/* PENDING */}
        <div className="bg-slate-50 border rounded-xl p-4">

          <p className="text-sm text-slate-500">
            Pending
          </p>

          <h3 className="text-2xl font-bold text-orange-500">
            {stats.pendingOperations}
          </h3>

        </div>

        {/* INCORRECT */}
        <div className="bg-slate-50 border rounded-xl p-4">

          <p className="text-sm text-slate-500">
            Incorrect
          </p>

          <h3 className="text-2xl font-bold text-red-600">
            {stats.incorrectOperations}
          </h3>

        </div>

        {/* AVG TIME */}
        <div className="bg-slate-50 border rounded-xl p-4">

          <p className="text-sm text-slate-500">
            Avg Process Time
          </p>

          <h3 className="text-2xl font-bold text-slate-800">
            {
              stats.averageProcessingTimeSeconds
            }
            s
          </h3>

        </div>

      </div>

    </div>
  );
}