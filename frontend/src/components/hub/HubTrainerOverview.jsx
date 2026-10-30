import { useState } from 'react';
const COPY = {
  en: {
    empty: 'No Postulante progress is available.',
    caption: 'Progress for all Postulantes',
    learner: 'Postulante',
    course: 'Course',
    completed: 'Completed',
    status: 'Status',
    notAssigned: 'Not assigned',
    unassigned: 'Unassigned',
    note: 'TRAINER and RRHH can manage Postulantes and course assignments in the management section.',
    statuses: {
      assigned: 'Assigned',
      in_progress: 'In progress',
      completed: 'Completed',
      withdrawn: 'Withdrawn',
    },
  },
  es: {
    empty: 'No hay progreso disponible para Postulantes.',
    caption: 'Progreso de todos los Postulantes',
    learner: 'Participante',
    course: 'Curso',
    completed: 'Completado',
    status: 'Estado',
    notAssigned: 'Sin asignar',
    unassigned: 'Sin asignar',
    note: 'TRAINER y RRHH pueden administrar Postulantes y asignar cursos en la sección de administración.',
    statuses: {
      assigned: 'Asignado',
      in_progress: 'En curso',
      completed: 'Completado',
      withdrawn: 'Retirado',
    },
  },
};
export default function HubTrainerOverview({ learners, locale = 'en' }) {
  const copy = COPY[locale] || COPY.en;
  const [search, setSearch] = useState('');
  const visibleLearners = (learners || []).filter((learner) =>
    `${learner.displayName} ${learner.username || ''}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const enrolments = (learners || []).flatMap((learner) => learner.enrolments || []);

  if (!learners?.length) {
    return <p className="hub-empty-state">{copy.empty}</p>;
  }

  return (
    <div>
      <div className="hub-progress-summary">
        {[
          [locale === 'es' ? 'Participantes' : 'Postulantes', learners.length],
          [locale === 'es' ? 'En curso' : 'In progress', enrolments.filter((item) => item.status === 'in_progress').length],
          [locale === 'es' ? 'Completados' : 'Completed courses', enrolments.filter((item) => item.status === 'completed').length],
          [locale === 'es' ? 'Sin curso' : 'Without a course', learners.filter((item) => !item.enrolments?.length).length],
        ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      <label className="hub-progress-search">{locale === 'es' ? 'Buscar progreso' : 'Search learner progress'}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === 'es' ? 'Nombre o usuario' : 'Name or username'} /></label>
    <div className="hub-table-wrap">
      <table className="hub-trainer-table">
        <caption>{copy.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{copy.learner}</th>
            <th scope="col">{copy.course}</th>
            <th scope="col">{copy.completed}</th>
            <th scope="col">{copy.status}</th>
          </tr>
        </thead>
        <tbody>
          {visibleLearners.flatMap((learner) => {
            const enrolments = learner.enrolments || [];
            if (!enrolments.length) {
              return [(
                <tr key={`${learner.id}-unassigned`}>
                  <th scope="row">{learner.displayName}</th>
                  <td>{copy.notAssigned}</td>
                  <td>0 / 0</td>
                  <td>{copy.unassigned}</td>
                </tr>
              )];
            }

            return enrolments.map((enrolment) => {
              const activities = (enrolment.modules || []).flatMap((module) => module.activities || []);
              const complete = activities.filter((activity) => activity.status === 'completed').length;
              return (
                <tr key={`${learner.id}-${enrolment.id}`}>
                  <th scope="row">{learner.displayName}</th>
                  <td>{enrolment.course?.title}</td>
                  <td><div className="hub-progress-cell"><span>{complete} / {activities.length}</span><progress aria-label={`${learner.displayName}: ${copy.completed}`} value={complete} max={activities.length || 1} /></div></td>
                  <td><span className={`hub-status-pill hub-status-${enrolment.status}`}>{copy.statuses[enrolment.status] || enrolment.status}</span></td>
                </tr>
              );
            });
          })}
          {!visibleLearners.length && <tr><td colSpan="4" className="hub-empty-state">{locale === 'es' ? 'No hay coincidencias.' : 'No learners match your search.'}</td></tr>}
        </tbody>
      </table>
      <p className="hub-readonly-note">{copy.note}</p>
    </div>
    </div>
  );
}
