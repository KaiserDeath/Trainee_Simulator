const SEGMENT_KINDS = new Set(["customer", "literal", "random-digits"]);

/**
 * Preserve the Account ID Lab prototype's normalization behavior: keep only
 * ASCII letters and digits, retaining their original case.
 *
 * This is behavior parity, not an approved production normalization policy.
 */
export function normalizeCustomerUsername(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "");
}

/** Generate a zero-padded digit string with a caller-injectable random source. */
export function randomDigits(length, random = Math.random) {
  if (!Number.isInteger(length) || length < 1) {
    throw new TypeError("Random digit length must be a positive integer.");
  }
  if (typeof random !== "function") {
    throw new TypeError("Random source must be a function.");
  }

  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("Random source must return a number from 0 (inclusive) to 1 (exclusive).");
  }

  const ceiling = 10 ** length;
  return String(Math.floor(value * ceiling)).padStart(length, "0");
}

/**
 * Construct an identifier from a caller-owned policy.
 *
 * Supported segment kinds:
 * - customer: normalized customer username, optionally truncated by maxLength
 * - literal: caller-provided text such as a prefix, suffix, or separator
 * - random-digits: a fixed-width generated numeric segment
 */
export function buildAccountIdentifier(customerUsername, policy, random = Math.random) {
  const normalizedUsername = normalizeCustomerUsername(customerUsername);
  if (!normalizedUsername) {
    throw new Error("Enter a customer username.");
  }

  const checkedPolicy = validatePolicy(policy);
  const renderedSegments = checkedPolicy.segments.map((segment) => ({
    ...segment,
    value: renderSegment(segment, normalizedUsername, random),
  }));

  return {
    policyKey: checkedPolicy.key,
    label: checkedPolicy.label,
    value: renderedSegments.map((segment) => segment.value).join(""),
    parts: renderedSegments
      .filter((segment) => segment.includeInParts !== false)
      .map((segment) => ({
        key: segment.key,
        label: segment.label,
        value: segment.value,
      })),
  };
}

/** Build the same anchored, case-insensitive pattern used by the prototype. */
export function expectedAccountIdentifierPattern(customerUsername, policy) {
  const normalizedUsername = normalizeCustomerUsername(customerUsername);
  const checkedPolicy = validatePolicy(policy);
  const source = checkedPolicy.segments
    .map((segment) => patternForSegment(segment, normalizedUsername))
    .join("");

  return new RegExp(`^${source}$`, "i");
}

/**
 * Validate both the selected policy key and the constructed value.
 * Approval and ownership of the supplied policy remain the caller's concern.
 */
export function validateAccountIdentifierAnswer({
  customerUsername,
  policy,
  selectedPolicyKey,
  answer,
}) {
  const checkedPolicy = validatePolicy(policy);
  const policyCorrect = String(selectedPolicyKey) === checkedPolicy.key;
  const valueCorrect = expectedAccountIdentifierPattern(customerUsername, checkedPolicy)
    .test(String(answer || "").trim());

  return {
    correct: policyCorrect && valueCorrect,
    policyCorrect,
    valueCorrect,
  };
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== "object") {
    throw new TypeError("Account ID policy must be an object.");
  }
  if (typeof policy.key !== "string" || !policy.key.trim()) {
    throw new TypeError("Account ID policy requires a non-empty key.");
  }
  if (typeof policy.label !== "string" || !policy.label.trim()) {
    throw new TypeError("Account ID policy requires a non-empty label.");
  }
  if (!Array.isArray(policy.segments) || policy.segments.length === 0) {
    throw new TypeError("Account ID policy requires at least one segment.");
  }

  for (const segment of policy.segments) {
    validateSegment(segment);
  }

  return policy;
}

function validateSegment(segment) {
  if (!segment || typeof segment !== "object" || !SEGMENT_KINDS.has(segment.kind)) {
    throw new TypeError("Account ID policy contains an unsupported segment.");
  }
  if (typeof segment.key !== "string" || !segment.key.trim()) {
    throw new TypeError("Every Account ID segment requires a non-empty key.");
  }
  if (typeof segment.label !== "string" || !segment.label.trim()) {
    throw new TypeError("Every Account ID segment requires a non-empty label.");
  }
  if (segment.kind === "literal" && typeof segment.value !== "string") {
    throw new TypeError("Literal Account ID segments require a string value.");
  }
  if (segment.kind === "customer" && segment.maxLength !== undefined
    && (!Number.isInteger(segment.maxLength) || segment.maxLength < 1)) {
    throw new TypeError("Customer segment maxLength must be a positive integer.");
  }
  if (segment.kind === "random-digits"
    && (!Number.isInteger(segment.length) || segment.length < 1)) {
    throw new TypeError("Random digit segment length must be a positive integer.");
  }
}

function renderSegment(segment, normalizedUsername, random) {
  if (segment.kind === "customer") {
    return segment.maxLength === undefined
      ? normalizedUsername
      : normalizedUsername.slice(0, segment.maxLength);
  }
  if (segment.kind === "literal") {
    return segment.value;
  }
  return randomDigits(segment.length, random);
}

function patternForSegment(segment, normalizedUsername) {
  if (segment.kind === "customer") {
    const value = segment.maxLength === undefined
      ? normalizedUsername
      : normalizedUsername.slice(0, segment.maxLength);
    return escapeRegularExpression(value);
  }
  if (segment.kind === "literal") {
    return escapeRegularExpression(segment.value);
  }
  return `\\d{${segment.length}}`;
}

function escapeRegularExpression(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
