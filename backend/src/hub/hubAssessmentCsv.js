const cell=value=>{
  const text=String(value??'');const safe=/^\s*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text)?`'${text}`:text;
  return `"${safe.replaceAll('"','""')}"`;
};
export function assessmentReportCsv(report){
  const rows=[['Learner','Username','Source','Evaluation','Attempt','Attempt set','Status','Official submission','Score','Policy revision','Started','Completed','Game','Operation type','Operation result','Evidence retention']];
  for(const attempt of report.attempts||[]){
    const operations=attempt.operationResults?.length?attempt.operationResults:[null];
    for(const operation of operations)rows.push([
      attempt.postulante?.display_name,attempt.postulante?.username,attempt.source||'legacy',attempt.evaluationTitle||'Legacy assessment',attempt.attempt_number,attempt.attemptSetNumber,
      attempt.status,attempt.source==='governed_evaluation'?(attempt.officialSubmitted?'Submitted':'Not submitted'):'',attempt.score,attempt.settings_snapshot?.revision,
      attempt.started_at,attempt.completed_at,operation?.game,operation?.operation_type,operation?.is_correct===true?'Correct':operation?.is_correct===false?'Incorrect':'',
      attempt.evidenceRetention?.state==='disposed'?'Detailed evidence disposed':'',
    ]);
  }
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
