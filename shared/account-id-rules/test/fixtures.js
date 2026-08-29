// Synthetic fixtures only. Their tokens and shapes are chosen to exercise the
// Evaluations prototype behavior; they are not Trez-approved account policies.
export const NEUTRAL_POLICIES = {
  generatedField: {
    key: "prototype-fixture.generated-field",
    label: "Fixture field",
    segments: [
      { kind: "customer", key: "customer", label: "Customer username" },
      { kind: "literal", key: "separator", label: "Separator", value: " ", includeInParts: false },
      { kind: "literal", key: "token", label: "Fixture token", value: "PX" },
    ],
  },
  prefixedId: {
    key: "prototype-fixture.prefixed-id",
    label: "Fixture ID",
    segments: [
      { kind: "literal", key: "prefix", label: "Fixture prefix", value: "Q.Z_" },
      { kind: "customer", key: "customer", label: "Visible customer", maxLength: 6 },
      { kind: "random-digits", key: "random", label: "Random digits", length: 3 },
    ],
  },
  suffixedId: {
    key: "prototype-fixture.suffixed-id",
    label: "Fixture ID",
    segments: [
      { kind: "customer", key: "customer", label: "Visible customer", maxLength: 8 },
      { kind: "literal", key: "token", label: "Fixture token", value: "LM" },
      { kind: "random-digits", key: "random", label: "Random digits", length: 4 },
    ],
  },
};

export const NEUTRAL_LEGACY_GAMES = {
  generatedField: { id: "fixture-one", name: "Fixture One", initials: "PX", type: 1 },
  prefixedId: { id: "fixture-two", name: "Fixture Two", initials: "Q.Z", type: 2 },
  suffixedId: { id: "fixture-three", name: "Fixture Three", initials: "LM", type: 3 },
};
