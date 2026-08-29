import axios from 'axios'

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true,
})

let hubCsrfToken = null;

export const getHubCsrf = async () => {
  const response = await api.get('/hub/auth/csrf');
  hubCsrfToken = response.data.csrfToken;
  return response;
};

const withHubCsrf = async () => {
  if (!hubCsrfToken) await getHubCsrf();
  return { headers: { 'x-trez-csrf': hubCsrfToken } };
};

export const loginHub = async (username, password) => {
  return api.post('/hub/auth/login', { username, password }, await withHubCsrf());
};

export const changeHubPassword = async (currentPassword, newPassword) =>
  api.post('/hub/auth/password', { currentPassword, newPassword }, await withHubCsrf());

export const getHubAdminAccounts = async () => api.get('/hub/admin/accounts');

export const createHubAccount = async (payload) =>
  api.post('/hub/admin/accounts', payload, await withHubCsrf());

export const resetHubStaffPassword = async (identityId) =>
  api.post(`/hub/admin/identities/${identityId}/password-reset`, {}, await withHubCsrf());

export const logoutHub = async () => {
  const response = await api.post('/hub/auth/logout', {}, await withHubCsrf());
  hubCsrfToken = null;
  return response;
};

export const getHubContext = async () => {
  return api.get('/hub/context');
};

export const getHubLearningPath = async () => {
  return api.get('/hub/learning-path');
};

export const completeHubActivity = async (activityId, payload) => {
  return api.post(`/hub/activities/${activityId}/complete`, payload, await withHubCsrf());
};

export const startHubFocusedPractice = async (activityId, payload) => {
  return api.post(`/hub/activities/${activityId}/focused-practice/start`, payload, await withHubCsrf());
};

export const getHubFocusedPractice = async (activityId) => {
  return api.get(`/hub/activities/${activityId}/focused-practice`);
};

export const submitHubRefreshBalance = async (activityId, payload) => {
  return api.post(`/hub/activities/${activityId}/focused-practice/refresh-balance`, payload, await withHubCsrf());
};

export const startHubAddCreditsPractice = async (activityId, payload) => {
  return api.post(`/hub/activities/${activityId}/focused-practice/add-credits/start`, payload, await withHubCsrf());
};

export const getHubAddCreditsPractice = async (activityId) => {
  return api.get(`/hub/activities/${activityId}/focused-practice/add-credits`);
};

export const rechargeHubAddCreditsPractice = async (activityId, payload) => {
  return api.post(`/hub/activities/${activityId}/focused-practice/add-credits/recharge`, payload, await withHubCsrf());
};

export const approveHubAddCreditsPractice = async (activityId, payload) => {
  return api.post(`/hub/activities/${activityId}/focused-practice/add-credits/approve`, payload, await withHubCsrf());
};

export const cancelHubAddCreditsPractice = async (activityId, payload) => {
  return api.post(`/hub/activities/${activityId}/focused-practice/add-credits/cancel`, payload, await withHubCsrf());
};

export const startHubWithdrawCreditsPractice = async (activityId, payload) =>
  api.post(`/hub/activities/${activityId}/focused-practice/withdraw-credits/start`, payload, await withHubCsrf());

export const getHubWithdrawCreditsPractice = async (activityId) =>
  api.get(`/hub/activities/${activityId}/focused-practice/withdraw-credits`);

export const redeemHubWithdrawCreditsPractice = async (activityId, payload) =>
  api.post(`/hub/activities/${activityId}/focused-practice/withdraw-credits/redeem`, payload, await withHubCsrf());

export const approveHubWithdrawCreditsPractice = async (activityId, payload) =>
  api.post(`/hub/activities/${activityId}/focused-practice/withdraw-credits/approve`, payload, await withHubCsrf());

export const cancelHubWithdrawCreditsPractice = async (activityId, payload) =>
  api.post(`/hub/activities/${activityId}/focused-practice/withdraw-credits/cancel`, payload, await withHubCsrf());

export const getHubTrainerLearners = async () => {
  return api.get('/hub/trainer/postulantes');
};

export const getHubPostulanteAccounts = async () => api.get('/hub/staff/postulantes');
export const createHubPostulante = async (payload) => api.post('/hub/staff/postulantes', payload, await withHubCsrf());
export const updateHubPostulante = async (identityId, payload) => api.patch(`/hub/staff/postulantes/${identityId}`, payload, await withHubCsrf());
export const deactivateHubPostulante = async (identityId) => api.post(`/hub/staff/postulantes/${identityId}/deactivate`, {}, await withHubCsrf());
export const getHubAssignableCourses = async () => api.get('/hub/staff/courses');
export const assignHubCourse = async (identityId, courseId) => api.post(`/hub/trainer/postulantes/${identityId}/enrolments`, { courseId }, await withHubCsrf());
export const getHubAssessmentSettings = async () => api.get('/hub/assessment/settings');
export const updateHubAssessmentSettings = async (payload) => api.put('/hub/assessment/settings', payload, await withHubCsrf());
export const getHubAssessmentReport = async (params = {}) => api.get('/hub/assessment/report', { params });
export const getHubScoredEvaluationPolicies = async () => api.get('/hub/assessment/evaluations');
export const updateHubScoredEvaluationPolicy = async (evaluationId, payload) => api.put(`/hub/assessment/evaluations/${evaluationId}`, payload, await withHubCsrf());
export const reopenHubScoredEvaluation = async (evaluationId, postulanteIdentityId, reason) => api.post(`/hub/assessment/evaluations/${evaluationId}/postulantes/${postulanteIdentityId}/reopen`, { reason }, await withHubCsrf());
export const getMyHubScoredEvaluations = async () => api.get('/hub/scored-evaluations');
export const startHubScoredEvaluationAttempt = async (evaluationId, idempotencyKey) => api.post(`/hub/scored-evaluations/${evaluationId}/attempts`, { idempotencyKey }, await withHubCsrf());
export const submitHubScoredEvaluationAttempt = async (attemptId) => api.post(`/hub/scored-evaluations/attempts/${attemptId}/submit`, {}, await withHubCsrf());

export const getHubAuditorOverview = async ({
  limit = 50,
  postulanteCursor,
  sessionCursor,
} = {}) => {
  return api.get('/hub/rrhh/overview', {
    params: {
      limit,
      ...(postulanteCursor ? { postulanteCursor } : {}),
      ...(sessionCursor ? { sessionCursor } : {}),
    },
  });
};

export const getHubAuditorTraineeLearningRecords = async (identityId, {
  limit = 50,
  moduleCursor,
  attemptCursor,
} = {}) => {
  return api.get(`/hub/rrhh/postulantes/${identityId}/learning-records`, {
    params: {
      limit,
      ...(moduleCursor ? { moduleCursor } : {}),
      ...(attemptCursor ? { attemptCursor } : {}),
    },
  });
};

export const getHubAuditorSimulatorSession = async (sessionId, {
  limit = 50,
  operationCursor,
  actionCursor,
} = {}) => {
  return api.get(`/hub/rrhh/simulator-sessions/${sessionId}`, {
    params: {
      limit,
      ...(operationCursor ? { operationCursor } : {}),
      ...(actionCursor ? { actionCursor } : {}),
    },
  });
};

export const getHubAuditorAttempt = async (attemptId, {
  limit = 50,
  activityCursor,
  evidenceCursor,
  artifactCursor,
} = {}) => {
  return api.get(`/hub/rrhh/hub-attempts/${attemptId}`, {
    params: {
      limit,
      ...(activityCursor ? { activityCursor } : {}),
      ...(evidenceCursor ? { evidenceCursor } : {}),
      ...(artifactCursor ? { artifactCursor } : {}),
    },
  });
};

export const getOperations = async (sessionId) => {
  return api.get(`/operations/${sessionId}`);
};

export const processOperation = async (
  operationId,
  payload
) => {
  return api.post(
    `/operations/${operationId}/process`,
    payload
  );
};

export const getCustomers = async (
  sessionId,
  query = ''
) => {
  return api.get(
    `/customers/${sessionId}`,
    {
      params: { q: query }
    }
  );
};

export const getCustomerHistory = async (
  sessionId,
  customerId
) => {
  return api.get(
    `/customers/${sessionId}/${customerId}/history`
  );
};

export const searchGameAccounts = async (
  sessionId,
  game,
  query = ''
) => {
  return api.get(
    `/games/${sessionId}/${game}/accounts`,
    {
      params: { q: query }
    }
  );
};

export const getGameWallet = async (
  sessionId,
  game
) => {
  return api.get(
    `/games/${sessionId}/${game}/wallet`
  );
};

export const rechargeGameAccount = async (
  accountId,
  amount,
  note
) => {
  const payload = { amount };
  if (String(note || '').trim()) payload.note = note;
  return api.post(
    `/games/accounts/${accountId}/recharge`,
    payload
  );
};

export const redeemGameAccount = async (
  accountId,
  amount,
  note
) => {
  const payload = { amount };
  if (String(note || '').trim()) payload.note = note;
  return api.post(
    `/games/accounts/${accountId}/redeem`,
    payload
  );
};

export const resetGamePassword = async (
  accountId,
  newPassword
) => {
  return api.post(
    `/games/accounts/${accountId}/reset-password`,
    { newPassword }
  );
};

export const createGameAccount = async (
  sessionId,
  game,
  payload
) => {
  return api.post(
    `/games/${sessionId}/${game}/accounts`,
    payload
  );
};

export const deleteSession = async (sessionId) => {
  return api.delete(`/trainer/sessions/${sessionId}`);
};

export const submitSessionForEvaluation = async (sessionId) => {
  return api.post(`/trainer/sessions/${sessionId}/submit`);
};

export const submitSession = async (sessionId) => {
  return api.post(`/sessions/${sessionId}/submit`);
};

export const getSessionById = async (sessionId) => {
  return api.get(`/sessions/${sessionId}`);
};

export const getGameAccountHistory = async (
  sessionId,
  customerId,
  game
) => {
  return api.get(
    `/games/${sessionId}/customers/${customerId}/history`,
    {
      params: { game }
    }
  );
};

export const logTraineeAction = async (
  sessionId,
  actionType,
  details = {}
) => {
  return api.post(
    `/trainer/sessions/${sessionId}/log-action`,
    { actionType, details }
  );
};

export const getSessionAuditLog = async (
  sessionId
) => {
  return api.get(
    `/trainer/sessions/${sessionId}/audit-log`
  );
};

export const getOperationTimeStats = async () => {
  return api.get(
    '/trainer/operation-time-stats'
  );
};

export const setSessionTimeLimit = async (
  sessionId,
  minutes
) => {
  return api.post(
    `/trainer/sessions/${sessionId}/time-limit`,
    { minutes }
  );
};

export const getSimulatorSettings = async () => {
  return api.get('/trainer/settings');
};

export const updateSimulatorSettings = async (settings) => {
  return api.post('/trainer/settings', settings);
};

export default api;
