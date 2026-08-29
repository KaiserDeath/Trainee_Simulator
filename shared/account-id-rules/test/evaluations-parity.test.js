import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildAccountIdentifier,
  expectedAccountIdentifierPattern,
  normalizeCustomerUsername,
  randomDigits,
  validateAccountIdentifierAnswer,
} from "../src/index.js";
import { NEUTRAL_LEGACY_GAMES, NEUTRAL_POLICIES } from "./fixtures.js";

const configuredReferencePath = process.env.ACCOUNT_ID_LAB_RULES_PATH;
const conventionalReferencePath = process.env.USERPROFILE
  ? path.join(process.env.USERPROFILE, "PROYECTOS", "Evaluations", "src", "rules.js")
  : undefined;
const referencePath = [configuredReferencePath, conventionalReferencePath]
  .find((candidate) => candidate && existsSync(candidate));
const skipReason = referencePath
  ? false
  : "Set ACCOUNT_ID_LAB_RULES_PATH to run live parity against Evaluations/src/rules.js.";

async function loadPrototype() {
  return import(pathToFileURL(referencePath).href);
}

test("matches live Evaluations normalization and digit generation", { skip: skipReason }, async () => {
  const prototype = await loadPrototype();

  for (const input of [" Mary-Jane 42 ", "á bc_12", "", null]) {
    assert.equal(normalizeCustomerUsername(input), prototype.cleanUsername(input));
  }
  assert.equal(randomDigits(3, () => 0.042), prototype.randomDigits(3, () => 0.042));
  assert.equal(randomDigits(4, () => 0.99999), prototype.randomDigits(4, () => 0.99999));
});

test("matches live Evaluations construction for neutral prototype fixtures", { skip: skipReason }, async () => {
  const prototype = await loadPrototype();
  const cases = [
    ["generatedField", "Neutral-Customer", () => 0.042],
    ["prefixedId", "Neutral-Customer", () => 0.042],
    ["suffixedId", "Neutral-Customer", () => 0.042],
  ];

  for (const [fixtureKey, username, random] of cases) {
    const current = buildAccountIdentifier(username, NEUTRAL_POLICIES[fixtureKey], random);
    const reference = prototype.buildAccount(username, NEUTRAL_LEGACY_GAMES[fixtureKey], random);
    assert.equal(current.value, reference.value, fixtureKey);
    assert.deepEqual(
      current.parts.map(({ label, value }) => ({ label, value })),
      reference.parts.map(({ value }, index) => ({
        label: current.parts[index].label,
        value,
      })),
      fixtureKey,
    );
  }
});

test("matches live Evaluations pattern and answer-validation results", { skip: skipReason }, async () => {
  const prototype = await loadPrototype();
  const username = "Neutral-Customer";
  const cases = [
    ["generatedField", "NeutralCustomer PX", 1],
    ["prefixedId", "Q.Z_Neutra999", 2],
    ["suffixedId", "NeutralCLM9999", 3],
  ];

  for (const [fixtureKey, answer, legacyType] of cases) {
    const policy = NEUTRAL_POLICIES[fixtureKey];
    const legacyGame = NEUTRAL_LEGACY_GAMES[fixtureKey];
    assert.equal(
      expectedAccountIdentifierPattern(username, policy).test(answer),
      prototype.expectedPattern(username, legacyGame).test(answer),
      fixtureKey,
    );

    const current = validateAccountIdentifierAnswer({
      customerUsername: username,
      policy,
      selectedPolicyKey: policy.key,
      answer,
    });
    const reference = prototype.validateBuiltAnswer({
      customerUsername: username,
      game: legacyGame,
      selectedType: legacyType,
      answer,
    });
    assert.deepEqual(
      { correct: current.correct, typeCorrect: current.policyCorrect, valueCorrect: current.valueCorrect },
      reference,
      fixtureKey,
    );
  }
});
