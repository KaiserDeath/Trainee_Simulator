const RAW_PAYLOAD_KEYS = new Set([
  'requestdata',
  'requestpayload',
  'submitteddata',
  'rawpayload',
  'rawrequest',
  'rawresponse'
]);

const SECRET_KEY_PARTS = [
  'token',
  'secret',
  'authorization',
  'bearer',
  'cookie',
  'credential',
  'sessiontoken',
  'sessionkey',
  'apikey'
];

const DANGEROUS_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype'
]);

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPasswordKey(key) {
  return normalizedKey(key).includes('password');
}

function isSecretKey(key) {
  const normalized = normalizedKey(key);
  return SECRET_KEY_PARTS.some((part) => normalized.includes(part));
}

function isRawPayloadKey(key) {
  return RAW_PAYLOAD_KEYS.has(normalizedKey(key));
}

export function sanitizeAuditorJson(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditorJson);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const sanitized = {};
  let passwordFieldObserved = false;
  let passwordWasPresent = false;

  for (const [key, nestedValue] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key.toLowerCase())) {
      continue;
    }

    if (isRawPayloadKey(key) || isSecretKey(key)) {
      continue;
    }

    if (isPasswordKey(key)) {
      passwordFieldObserved = true;
      passwordWasPresent =
        passwordWasPresent ||
        (normalizedKey(key) === 'passwordprovided'
          ? Boolean(nestedValue)
          : nestedValue !== null && String(nestedValue).length > 0);
      continue;
    }

    sanitized[key] = sanitizeAuditorJson(nestedValue);
  }

  if (passwordFieldObserved) {
    sanitized.passwordProvided = passwordWasPresent;
  }

  return sanitized;
}

function evidencePresence(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (
    normalized === '' ||
    normalized === 'missing' ||
    normalized === 'not updated' ||
    normalized === 'not provided'
  ) {
    return 'Missing';
  }
  return 'Provided';
}

export function sanitizeValidationRequirement(requirement = {}) {
  const label = String(requirement.label ?? '');
  if (isPasswordKey(label)) {
    return {
      label,
      expected: evidencePresence(requirement.expected),
      sent: evidencePresence(requirement.sent),
      ok: Boolean(requirement.ok)
    };
  }

  return {
    label,
    expected: sanitizeAuditorJson(requirement.expected),
    sent: sanitizeAuditorJson(requirement.sent),
    ok: Boolean(requirement.ok)
  };
}

export function sanitizeAuditorOperation(operation = {}) {
  const requirementInput =
    operation.validationRequirements ||
    operation.validation_requirements ||
    [];
  const requirements = Array.isArray(requirementInput)
    ? requirementInput.map(sanitizeValidationRequirement)
    : [];
  const rawRequestEvidence =
    operation.requestEvidence ||
    operation.requestData ||
    operation.request_data ||
    {};
  const requestEvidence = sanitizeAuditorJson(rawRequestEvidence);

  return {
    id: operation.id,
    type: operation.type,
    amount: operation.amount ?? null,
    status: operation.status,
    createdAt: operation.created_at ?? operation.createdAt ?? null,
    processedAt: operation.processed_at ?? operation.processedAt ?? null,
    processedBy: operation.processed_by ?? operation.processedBy ?? null,
    isCorrect: operation.is_correct ?? operation.isCorrect ?? null,
    processingTimeSeconds:
      operation.processing_time_seconds ??
      operation.processingTimeSeconds ??
      null,
    handlingTimeSeconds:
      operation.handling_time_seconds ??
      operation.handlingTimeSeconds ??
      null,
    game: operation.game ?? operation.game_account?.game ?? '',
    customerName:
      operation.customerName ?? operation.customer_name ?? '',
    customerUsername: operation.customerUsername ?? '',
    mobileId: operation.mobileId ?? operation.mobile_id ?? '',
    expectedResult:
      operation.expectedResult ?? operation.expected_result ?? null,
    sentResult: operation.sentResult ?? operation.sent_result ?? null,
    requestEvidence,
    validationRequirements: requirements,
    failurePoints: requirements.filter((requirement) => !requirement.ok)
  };
}

export function sanitizeAuditorActionLog(log = {}, parsedDetails = {}) {
  return {
    id: log.id,
    operationId: log.operation_id ?? log.operationId ?? null,
    actionType: log.action_type ?? log.actionType ?? '',
    timestamp: log.timestamp ?? log.created_at ?? null,
    details: sanitizeAuditorJson(parsedDetails)
  };
}
