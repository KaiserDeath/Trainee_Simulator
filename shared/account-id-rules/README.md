# Account ID rules

Framework-independent primitives for customer-username normalization, segmented
Account ID construction, expected-pattern generation, and answer validation.

## Safety boundary

This package captures behavior parity with the standalone `Evaluations`
prototype. It is not an approved Trez policy catalogue or a scoring authority.
It intentionally contains no default games, game initials, family assignments,
password rules, account formulas, or financial/escalation behavior.

Every identifier shape comes from a policy supplied by the caller. Production
and scored callers must load a server-owned, versioned, Trez-approved policy;
the synthetic policies in `test/fixtures.js` are test data only.

## Usage

```js
import { buildAccountIdentifier } from "@trez-training/account-id-rules";

const result = buildAccountIdentifier("Example-Customer", approvedPolicy);
```

The policy declares an ordered list of `customer`, `literal`, and
`random-digits` segments. The package validates and renders that input but does
not decide which policy applies.

## Verification

```powershell
npm test --prefix shared/account-id-rules
```

The suite uses neutral fixtures. When the standalone reference exists at
`%USERPROFILE%\PROYECTOS\Evaluations\src\rules.js`, it also runs live parity
checks. Otherwise those live checks are skipped; set `ACCOUNT_ID_LAB_RULES_PATH`
to the reference file to enable them explicitly.
