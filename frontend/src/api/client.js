import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
})

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

export const rechargeGameAccount = async (
  accountId,
  amount
) => {
  return api.post(
    `/games/accounts/${accountId}/recharge`,
    { amount }
  );
};

export const redeemGameAccount = async (
  accountId,
  amount
) => {
  return api.post(
    `/games/accounts/${accountId}/redeem`,
    { amount }
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
  customerId
) => {
  return api.get(
    `/games/${sessionId}/customers/${customerId}/history`
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

export const setSessionTimeLimit = async (
  sessionId,
  minutes
) => {
  return api.post(
    `/trainer/sessions/${sessionId}/time-limit`,
    { minutes }
  );
};

export default api
