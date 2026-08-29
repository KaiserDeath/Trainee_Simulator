import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAccountIdentifier,
  expectedAccountIdentifierPattern,
  normalizeCustomerUsername,
  randomDigits,
  validateAccountIdentifierAnswer,
} from "../src/index.js";
import { NEUTRAL_POLICIES } from "./fixtures.js";

test("normalizes a customer username with prototype-compatible ASCII rules", () => {
  assert.equal(normalizeCustomerUsername(" Mary-Jane 42 "), "MaryJane42");
  assert.equal(normalizeCustomerUsername("á bc_12"), "bc12");
  assert.equal(normalizeCustomerUsername(null), "");
});

test("generates fixed-width random digits with leading zeroes", () => {
  assert.equal(randomDigits(3, () => 0), "000");
  assert.equal(randomDigits(4, () => 0.99999), "9999");
});

test("rejects an invalid random source result", () => {
  assert.throws(() => randomDigits(3, () => 1), /0 \(inclusive\).*1 \(exclusive\)/);
});

test("constructs an identifier entirely from a caller-supplied policy", () => {
  const result = buildAccountIdentifier(
    "Neutral-Customer",
    NEUTRAL_POLICIES.prefixedId,
    () => 0.042,
  );

  assert.equal(result.value, "Q.Z_Neutra042");
  assert.deepEqual(result.parts, [
    { key: "prefix", label: "Fixture prefix", value: "Q.Z_" },
    { key: "customer", label: "Visible customer", value: "Neutra" },
    { key: "random", label: "Random digits", value: "042" },
  ]);
});

test("can omit presentation-only separator segments from the breakdown", () => {
  const result = buildAccountIdentifier("Neutral", NEUTRAL_POLICIES.generatedField);

  assert.equal(result.value, "Neutral PX");
  assert.deepEqual(result.parts.map((part) => part.value), ["Neutral", "PX"]);
});

test("escapes caller-supplied literals when constructing the expected pattern", () => {
  const pattern = expectedAccountIdentifierPattern("Neutral-Customer", NEUTRAL_POLICIES.prefixedId);

  assert.match("Q.Z_Neutra001", pattern);
  assert.doesNotMatch("QxZ_Neutra001", pattern);
  assert.doesNotMatch("Q.Z_Neutra01", pattern);
});

test("validates the policy selection independently from the answer value", () => {
  assert.deepEqual(validateAccountIdentifierAnswer({
    customerUsername: "Neutral-Customer",
    policy: NEUTRAL_POLICIES.suffixedId,
    selectedPolicyKey: "different-policy",
    answer: "NeutralCLM1234",
  }), {
    correct: false,
    policyCorrect: false,
    valueCorrect: true,
  });
});

test("requires non-empty normalized customer input for construction", () => {
  assert.throws(
    () => buildAccountIdentifier("---", NEUTRAL_POLICIES.generatedField),
    /Enter a customer username/,
  );
});

test("rejects malformed policies before construction", () => {
  assert.throws(
    () => buildAccountIdentifier("Neutral", { key: "fixture", label: "Fixture", segments: [] }),
    /at least one segment/,
  );
});
