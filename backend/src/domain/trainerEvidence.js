export function sanitizeRequestEvidence(
  requestData = {}
) {
  if (
    typeof requestData !== 'object' ||
    requestData === null ||
    Array.isArray(requestData)
  ) {
    return {};
  }

  const evidence = {};

  for (const key of [
    'gameId',
    'kiosk',
    'amount'
  ]) {
    if (requestData[key] !== undefined) {
      evidence[key] = requestData[key];
    }
  }

  if (requestData.newPassword !== undefined) {
    evidence.passwordProvided = Boolean(
      String(requestData.newPassword)
    );
  }

  return evidence;
}

export function stripRawRequestPayload(
  operation = {}
) {
  const sanitized = { ...operation };

  for (const field of [
    'request_data',
    'requestData',
    'request_payload',
    'submitted_data'
  ]) {
    delete sanitized[field];
  }

  return sanitized;
}

export function buildReservationRequirement(
  operation
) {
  if (
    operation?.type !== 'ADD CREDITS' ||
    Number(operation.queue_policy_version) !== 1 ||
    operation.status === 'PENDING'
  ) {
    return null;
  }

  const expected =
    operation.status === 'APPROVED'
      ? 'COMMITTED'
      : operation.status === 'CANCELLED'
        ? 'RELEASED'
        : 'UNKNOWN';
  const sent =
    operation.customer_reservation_status ||
    'MISSING';

  return {
    label: 'Customer reservation',
    expected,
    sent,
    ok: expected !== 'UNKNOWN' && sent === expected
  };
}

export function buildSecretMatchRequirement({
  label,
  submittedValue,
  storedValue
}) {
  const submitted = Boolean(
    String(submittedValue ?? '')
  );
  const stored = Boolean(
    String(storedValue ?? '')
  );

  return {
    label,
    expected: 'Matches submitted value',
    sent: stored ? 'Updated' : 'Not updated',
    ok:
      submitted &&
      stored &&
      storedValue === submittedValue
  };
}
