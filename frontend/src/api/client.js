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


export default api