export class HubError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'HubError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function isHubError(error) {
  return error instanceof HubError;
}
