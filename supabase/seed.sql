-- Local prototype settings. These are adjustable runtime values, not approved
-- Trez scoring, authentication, financial, account, or escalation policy.
INSERT INTO simulator_settings (key, value)
VALUES
  ('session_timeout_minutes', '30'::jsonb),
  ('min_opm', '2'::jsonb),
  ('max_opm', '4'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

-- Stable role labels only. Their permissions and identity provisioning remain
-- intentionally undefined until Trez approves the authorization policy.
INSERT INTO hub_roles (id, code, display_name)
VALUES
  ('10000000-0000-4000-8000-000000000201', 'postulante', 'Postulante'),
  ('10000000-0000-4000-8000-000000000202', 'trainer', 'Trainer'),
  ('10000000-0000-4000-8000-000000000203', 'admin', 'Admin'),
  ('10000000-0000-4000-8000-000000000204', 'rrhh', 'RRHH')
ON CONFLICT (id) DO UPDATE
SET code = EXCLUDED.code,
    display_name = EXCLUDED.display_name;

-- Draft, provisional, non-scored learning structure derived only from the
-- approved Module 1 through Module 11 product requirements. Modules 3, 4, 8, 9,
-- 10, and 11 retain their explicit policy gates.
-- deliberately remain blocked at their policy/artifact boundaries: no pass
-- threshold, retry rule, account formula, password, or escalation procedure is
-- seeded.
INSERT INTO hub_courses (
  id,
  stable_code,
  title,
  description,
  publication_status,
  is_provisional,
  is_scored
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'trez-operator-foundations',
  'Trez Training Hub — Operator Foundations',
  'Provisional operator path through foundations, applied operations, mixed practice, and a policy-gated final full-shift assessment.',
  'draft',
  TRUE,
  FALSE
)
ON CONFLICT (id) DO UPDATE
SET stable_code = EXCLUDED.stable_code,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    publication_status = EXCLUDED.publication_status,
    is_provisional = EXCLUDED.is_provisional,
    is_scored = EXCLUDED.is_scored,
    updated_at = NOW();

INSERT INTO hub_modules (
  id,
  course_id,
  stable_code,
  position,
  title,
  summary,
  publication_status,
  is_provisional,
  is_scored
)
VALUES
  (
    '10000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000001',
    'understanding-the-work',
    1,
    'Understanding the Work',
    'How customers, Trez, companies and licenses, and game platforms interact, and what operators are expected to protect and verify.',
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000001',
    'complete-workflow-orientation',
    2,
    'Complete Workflow Orientation',
    'A provisional preview of Trez Backend, licensed game access, operation categories, histories, and the verification-first workflow.',
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000103',
    '10000000-0000-4000-8000-000000000001',
    'account-creation',
    3,
    'Account Creation',
    'Learn the linked account-creation workflow. The native rule lab and simulator application remain unavailable until an approved game policy is published.',
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000104',
    '10000000-0000-4000-8000-000000000001',
    'search-for-customer',
    4,
    'Search for Customer',
    'Find and positively confirm the exact player produced by Module 3 using the application-controlled Ctrl+F then Ctrl+V procedure.',
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000105',
    '10000000-0000-4000-8000-000000000001',
    'refresh-balance',
    5,
    'Refresh Balance',
    'Use a focused Orion Stars balance surface to retrieve and verify the game-side balance, then submit the observed value to Trez Backend through the Hub.',
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000106',
    '10000000-0000-4000-8000-000000000001',
    'add-credits',
    6,
    'Add Credits',
    'Verify the customer and game account, reserve the customer amount, perform the game-side credit, and complete the Backend decision without duplicating the movement.',
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000107',
    '10000000-0000-4000-8000-000000000001',
    'withdraw-credits',
    7,
    'Withdraw Credits',
    'Verify the customer and game account, perform the game-side withdrawal, and complete the existing Backend decision without duplicating the movement.',
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000108',
    '10000000-0000-4000-8000-000000000001',
    'reset-password',
    8,
    'Reset Password',
    'Understand the verification-first reset workflow. The game-specific policy and executable practice remain blocked until Trez approves them.',
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000109',
    '10000000-0000-4000-8000-000000000001',
    'exceptional-advanced-operations',
    9,
    'Exceptional and Advanced Operations',
    'Recognize uncertain or exceptional evidence and stop safely. Executable exception workflows remain blocked until Trez approves each scenario and outcome.',
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000110',
    '10000000-0000-4000-8000-000000000001',
    'mixed-operation-practice',
    10,
    'Mixed-Operation Practice',
    'Apply completed workflows in a controlled mixed practice. Scheduling, difficulty, timing, remediation, and attempt rules remain approval-gated.',
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000001',
    'final-full-shift-assessment',
    11,
    'Final Full-Shift Assessment',
    'Complete all modules, then reach 100% in a configurable full-shift assessment. Unsuccessful attempts retain evidence and may be retried without resetting module progress.',
    'draft',
    TRUE,
    TRUE
  )
ON CONFLICT (id) DO UPDATE
SET course_id = EXCLUDED.course_id,
    stable_code = EXCLUDED.stable_code,
    position = EXCLUDED.position,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    publication_status = EXCLUDED.publication_status,
    is_provisional = EXCLUDED.is_provisional,
    is_scored = EXCLUDED.is_scored,
    updated_at = NOW();

INSERT INTO hub_activities (
  id,
  module_id,
  stable_code,
  position,
  activity_type,
  title,
  content,
  publication_status,
  is_provisional,
  is_scored
)
VALUES
  (
    '10000000-0000-4000-8000-000000001101',
    '10000000-0000-4000-8000-000000000101',
    'ecosystem-and-balances',
    1,
    'article',
    'The Trez operating ecosystem',
    $$
    {
      "summary": "Customers use Trez services through companies and licensed access while external game platforms hold individual game accounts.",
      "learningObjectives": [
        "Describe how customers, Trez, companies and licenses, and external game platforms interact.",
        "Distinguish a customer's general Trez Backend balance from the balance inside an individual game."
      ],
      "keyPoints": [
        "A customer's general balance and each individual game balance are separate records.",
        "The selected company or license and the selected game are both part of the operational context.",
        "Transactions, Movements, and Requests represent different categories of work in Trez Backend."
      ]
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000001102',
    '10000000-0000-4000-8000-000000000101',
    'operator-responsibilities',
    2,
    'article',
    'Operator responsibilities and standards',
    $$
    {
      "summary": "Operators protect customer funds and account access by verifying context and evidence before taking action.",
      "keyPoints": [
        "Follow assigned access and confirm the customer, license, game, and amount when applicable.",
        "Verify before acting, especially when an operation may already have been completed.",
        "Avoid duplicate actions and preserve accurate, traceable evidence.",
        "Protect credentials and confidentiality, and escalate uncertainty through an approved procedure.",
        "Using the wrong license, changing the wrong player, or duplicating a financial movement can affect customer funds or account access."
      ]
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000001103',
    '10000000-0000-4000-8000-000000000101',
    'foundation-knowledge-check',
    3,
    'checklist',
    'Foundation knowledge check',
    $$
    {
      "instructions": "Use these provisional, non-scored self-check prompts to review the concepts in Module 1, then acknowledge completion.",
      "prompts": [
        "Explain why the general customer balance and a game balance must not be treated as the same balance.",
        "List the context an operator verifies before changing account or balance data.",
        "Explain why evidence must be checked before repeating a game-side action."
      ]
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000002101',
    '10000000-0000-4000-8000-000000000102',
    'backend-and-licensed-access',
    1,
    'article',
    'Trez Backend and licensed game access',
    $$
    {
      "summary": "Module 2 turns the foundation concepts into a visible orientation to Trez Backend and licensed game access.",
      "keyPoints": [
        "Use assigned Backend access and the license required for the operation.",
        "Review customer information, registered games, and Backend customer history.",
        "Open the correct licensed game access and positively confirm the player.",
        "Keep game-side action history separate from Backend customer movement history."
      ]
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000002102',
    '10000000-0000-4000-8000-000000000102',
    'verification-first-walkthrough',
    2,
    'checklist',
    'The complete verification-first workflow',
    $$
    {
      "mode": "demonstration",
      "steps": [
        "Receive an actionable operation in Trez Backend.",
        "Verify operation type, company or license, game, customer or player identifier, amount when applicable, and current status.",
        "Open the correct licensed game access.",
        "Search for and positively confirm the player account.",
        "Check game-side history and Trez customer history before changing balance or account data.",
        "Perform the requested action only when it is not already present, then recheck the resulting evidence.",
        "Return to Trez Backend and take only a permitted final action.",
        "Keep the Backend result and game-side evidence available for validation.",
        "Record the outcome, time, mistakes, assistance, and learning progress."
      ]
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000002103',
    '10000000-0000-4000-8000-000000000102',
    'operation-category-preview',
    3,
    'article',
    'Operation and skill preview',
    $$
    {
      "summary": "This preview introduces later learning without defining unapproved account, scoring, or escalation policy.",
      "topics": [
        "Transactions: Purchases and Cashouts remain learning-only until Trez defines their simulation scope.",
        "Movements: Add Credits and Withdraw Credits change general and game balances through distinct actions and evidence.",
        "Requests: Create Account, Refresh Balance, and Reset Password require game-specific approved policy.",
        "Search for Customer is a prerequisite skill used to positively identify the correct player before later operations."
      ]
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000003101',
    '10000000-0000-4000-8000-000000000103',
    'account-creation-continuity',
    1,
    'article',
    'One request, one account, one evidence trail',
    $$
    {
      "summary": "Module 3 must keep the originating Backend request, customer, company or license, game, policy version, created player, and final Backend result in one continuous attempt.",
      "keyPoints": [
        "Verify the request and assigned game context before constructing or creating an identifier.",
        "The Account ID Lab teaches an approved structure; it does not create the simulated player.",
        "The simulator-created identifier becomes a durable CREATED_GAME_ACCOUNT artifact for Module 4.",
        "No account formula shown by a prototype is authoritative until Trez publishes its policy version."
      ]
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000003102',
    '10000000-0000-4000-8000-000000000103',
    'native-account-id-lab',
    2,
    'interactive_rule_lab',
    'Account ID Lab',
    $$
    {
      "policyStatus": "required",
      "blockedReason": "Trez must approve and publish the first game-family account-structure policy before this activity can construct or validate identifiers.",
      "requirements": [
        "Approved game and family",
        "Immutable account-structure policy version",
        "Server-assigned customer and licensed access",
        "No browser-editable authoritative formula"
      ]
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000003103',
    '10000000-0000-4000-8000-000000000103',
    'create-linked-training-account',
    3,
    'quick_simulation',
    'Create the linked training account',
    $$
    {
      "policyStatus": "required",
      "blockedReason": "The simulator application stage remains disabled until the first game policy and originating Create Account request contract are approved.",
      "requiredArtifactType": "CREATED_GAME_ACCOUNT"
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000004101',
    '10000000-0000-4000-8000-000000000104',
    'exact-player-search-procedure',
    1,
    'article',
    'Exact-player search procedure',
    $$
    {
      "summary": "Search is a read-only verification skill. Module 4 must consume the exact player identifier produced by Module 3.",
      "steps": [
        "Open the correct licensed game access and player list.",
        "Copy the exact Module 3 username or Mobile ID.",
        "Use the application-controlled Ctrl+F shortcut, then paste with Ctrl+V.",
        "Confirm an exact match using the required customer evidence.",
        "Do not change account or balance data during the search-only task."
      ]
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000004102',
    '10000000-0000-4000-8000-000000000104',
    'search-created-account',
    2,
    'focused_practice',
    'Search for the Module 3 player',
    $$
    {
      "artifactStatus": "required",
      "blockedReason": "Complete the policy-backed Module 3 simulator exercise so the server can supply its CREATED_GAME_ACCOUNT artifact.",
      "targetArtifactType": "CREATED_GAME_ACCOUNT",
      "requiredEvidence": [
        "Ctrl+F observed",
        "Ctrl+V paste observed",
        "Exact query",
        "Exact matched player",
        "Positive confirmation"
      ]
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000005101',
    '10000000-0000-4000-8000-000000000105',
    'orion-stars-refresh-balance',
    1,
    'focused_practice',
    'Check the Orion Stars balance and update Trez Backend',
    $$
    {
      "game": "Orion Stars",
      "surface": "balance",
      "operation": "REFRESH BALANCE",
      "timedSimulator": false,
      "provisional": true,
      "gameOptions": [
        {"id": "orion-stars", "label": "Orion Stars", "status": "available"},
        {"id": "vblink", "label": "Vblink", "status": "not_ready"},
        {"id": "golden-dragon", "label": "Golden Dragon", "status": "not_ready"}
      ],
      "instructions": [
        "Start the focused Orion Stars practice surface; the timed full simulator is not opened.",
        "Find the assigned player and read the game-side Credit and Available Balance values.",
        "Return those observed values to the Hub so the server can verify them before recording completion."
      ],
      "blockedReason": "This focused practice is available only when the local Hub practice adapter is configured."
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000006101',
    '10000000-0000-4000-8000-000000000106',
    'add-credits-verification-first',
    1,
    'article',
    'Add Credits: verify before you act',
    $$
    {
      "summary": "Add Credits is a verification-first movement. Confirm the assigned customer, game, player, amount, and current history before changing the game-side account.",
      "keyPoints": [
        "A pending Add Credits request reserves the customer amount immediately; the customer balance and game wallet are separate values.",
        "Use the exact assigned game account and requested amount. Do not create a second pending movement for the same customer and game.",
        "Perform the game-side credit, confirm the game history, then approve the existing Backend request once.",
        "If the movement must be stopped before approval, cancel it once so the held customer amount is released exactly once."
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000006102',
    '10000000-0000-4000-8000-000000000106',
    'add-credits-preflight-checklist',
    2,
    'checklist',
    'Add Credits preflight checklist',
    $$
    {
      "summary": "Review each verification point before opening the focused Add Credits surface.",
      "items": [
        {"id": "customer", "label": "I confirmed the assigned customer and the correct game account."},
        {"id": "amount", "label": "I confirmed the requested amount and checked the existing movement history."},
        {"id": "reservation", "label": "I understand that the customer amount is reserved before game-side approval."},
        {"id": "decision", "label": "I will approve once after game evidence exists, or cancel once if the movement must stop."}
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000006103',
    '10000000-0000-4000-8000-000000000106',
    'orion-stars-add-credits',
    3,
    'focused_practice',
    'Perform the Orion Stars Add Credits movement',
    $$
    {
      "game": "Orion Stars",
      "surface": "add_credits",
      "operation": "ADD CREDITS",
      "amount": 25,
      "timedSimulator": false,
      "provisional": true,
      "gameOptions": [
        {"id": "orion-stars", "label": "Orion Stars", "status": "available"},
        {"id": "vblink", "label": "Vblink", "status": "not_ready"},
        {"id": "golden-dragon", "label": "Golden Dragon", "status": "not_ready"}
      ],
      "instructions": [
        "Open the focused Orion Stars Add Credits surface; the timed full simulator is not opened.",
        "Verify the customer, game account, requested amount, and reservation before changing the game account.",
        "Perform one game-side credit, confirm the resulting game evidence, and approve the existing Backend request once."
      ],
      "blockedReason": "This focused Add Credits practice is available only when the local Hub practice adapter is configured."
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000007101',
    '10000000-0000-4000-8000-000000000107',
    'withdraw-credits-verification-first',
    1,
    'article',
    'Withdraw Credits: verify before you act',
    $$
    {
      "summary": "Withdraw Credits is a verification-first movement. Confirm the assigned customer, game, player, amount, and current history before changing the game-side account.",
      "keyPoints": [
        "A game-side withdrawal reduces the game account credit and increases the independent game wallet.",
        "Use the exact assigned game account and requested amount. Do not create a second pending movement for the same customer and game.",
        "Perform the game-side withdrawal, confirm the game history, then approve the existing Backend request once.",
        "If the movement must be stopped before approval, cancel it once; cancellation does not create a second movement."
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000007102',
    '10000000-0000-4000-8000-000000000107',
    'withdraw-credits-preflight-checklist',
    2,
    'checklist',
    'Withdraw Credits preflight checklist',
    $$
    {
      "summary": "Review each verification point before opening the focused Withdraw Credits surface.",
      "items": [
        {"id": "customer", "label": "I confirmed the assigned customer and the correct game account."},
        {"id": "amount", "label": "I confirmed the requested amount and checked the existing movement history."},
        {"id": "balances", "label": "I understand the game account decreases while the independent game wallet increases."},
        {"id": "decision", "label": "I will approve once after game evidence exists, or cancel once if the movement must stop."}
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000007103',
    '10000000-0000-4000-8000-000000000107',
    'orion-stars-withdraw-credits',
    3,
    'focused_practice',
    'Perform the Orion Stars Withdraw Credits movement',
    $$
    {
      "game": "Orion Stars",
      "surface": "withdraw_credits",
      "operation": "WITHDRAW CREDITS",
      "amount": 25,
      "timedSimulator": false,
      "provisional": true,
      "gameOptions": [
        {"id": "orion-stars", "label": "Orion Stars", "status": "available"},
        {"id": "vblink", "label": "Vblink", "status": "not_ready"},
        {"id": "golden-dragon", "label": "Golden Dragon", "status": "not_ready"}
      ],
      "instructions": [
        "Open the focused Orion Stars Withdraw Credits surface; the timed full simulator is not opened.",
        "Verify the customer, game account, requested amount, and independent balances before changing the game account.",
        "Perform one game-side withdrawal, confirm the resulting game evidence, and approve the existing Backend request once."
      ],
      "blockedReason": "This focused Withdraw Credits practice is available only when the local Hub practice adapter is configured."
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000008101',
    '10000000-0000-4000-8000-000000000108',
    'reset-password-verification-first',
    1,
    'article',
    'Reset Password — verify before you act',
    $$
    {
      "summary": "A password reset must be tied to the exact assigned game account and an approved platform policy.",
      "keyPoints": [
        "Confirm the customer, game, account, and current Backend request before any reset action.",
        "Do not infer password complexity, generation, reset, recovery, lockout, or escalation rules from the simulator.",
        "Never place a password literal in ordinary Hub evidence, reports, analytics, or browser persistence.",
        "This practice remains blocked until Trez publishes the game-specific policy and secure reset adapter."
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000008102',
    '10000000-0000-4000-8000-000000000108',
    'reset-password-preflight-checklist',
    2,
    'checklist',
    'Reset Password preflight checklist',
    $$
    {
      "summary": "Review the safety checks before a password reset is ever enabled.",
      "items": [
        {"id": "account", "label": "I confirmed the exact assigned customer, game, and game account."},
        {"id": "policy", "label": "I will use only a server-published game password policy."},
        {"id": "secrets", "label": "I will not record or expose a password literal in evidence or reports."},
        {"id": "blocked", "label": "I understand this executable practice stays blocked until policy approval."}
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000008103',
    '10000000-0000-4000-8000-000000000108',
    'reset-password-policy-gated-practice',
    3,
    'quick_simulation',
    'Reset Password practice (policy approval required)',
    $$
    {
      "policyStatus": "required",
      "provisional": true,
      "scored": false,
      "blockedReason": "Trez must approve the exact game-specific password policy and secure reset adapter before this practice can run."
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000009101',
    '10000000-0000-4000-8000-000000000109',
    'exceptional-operations-verification-first',
    1,
    'article',
    'Exceptional operations — verify and stop safely',
    $$
    {
      "summary": "When evidence is inconsistent or a match is ambiguous, protect the customer by refusing an unsafe mutation.",
      "keyPoints": [
        "Recognize inconsistent histories, ambiguous matches, unavailable game access, and stale processing states.",
        "Do not invent an escalation, cancellation, retry, purchase, cashout, or other financial outcome.",
        "Preserve the evidence needed for an approved resolution and leave the state unchanged when it cannot be verified.",
        "Each executable exception scenario requires a Trez-approved safe outcome before it can be trained or scored."
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000009102',
    '10000000-0000-4000-8000-000000000109',
    'exceptional-operations-preflight-checklist',
    2,
    'checklist',
    'Exceptional operations preflight checklist',
    $$
    {
      "summary": "Review the safety checks before an approved exception workflow is enabled.",
      "items": [
        {"id": "evidence", "label": "I identified the exact evidence that is inconsistent, ambiguous, unavailable, or stale."},
        {"id": "no-mutation", "label": "I will not mutate customer, account, or balance state while evidence is insufficient."},
        {"id": "approved-outcome", "label": "I will use only a server-published Trez outcome for this scenario."},
        {"id": "blocked", "label": "I understand unapproved exception scenarios remain blocked."}
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000009103',
    '10000000-0000-4000-8000-000000000109',
    'exceptional-operations-policy-gated-practice',
    3,
    'quick_simulation',
    'Exceptional operations practice (policy approval required)',
    $$
    {
      "policyStatus": "required",
      "provisional": true,
      "scored": false,
      "blockedReason": "Trez must approve the exact exceptional scenarios and safe outcomes before this practice can run."
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000010101',
    '10000000-0000-4000-8000-000000000110',
    'mixed-practice-verification-first',
    1,
    'article',
    'Mixed operations — preserve the verification sequence',
    $$
    {
      "summary": "Mixed practice combines only workflows whose prerequisites and approved boundaries are complete.",
      "keyPoints": [
        "Verify the operation type, customer, game, account, amount, current status, and existing evidence before acting.",
        "Keep customer movement history separate from game-side history and preserve exactly-once behavior.",
        "Do not assume a difficulty, timer, retry, remediation, or scoring rule that has not been published by Trez.",
        "When a scenario cannot be safely verified, leave state unchanged and follow an approved outcome."
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000010102',
    '10000000-0000-4000-8000-000000000110',
    'mixed-practice-preflight-checklist',
    2,
    'checklist',
    'Mixed-operation preflight checklist',
    $$
    {
      "summary": "Review the boundaries before mixed-operation scheduling is enabled.",
      "items": [
        {"id": "prerequisites", "label": "I will use only operations whose learning prerequisites are complete."},
        {"id": "context", "label": "I will verify each operation context and current history before acting."},
        {"id": "separation", "label": "I will keep Backend movement history separate from game-side history."},
        {"id": "policy", "label": "I understand mixed scheduling remains blocked until Trez approves its rules."}
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000010103',
    '10000000-0000-4000-8000-000000000110',
    'mixed-operation-policy-gated-practice',
    3,
    'quick_simulation',
    'Mixed-operation practice (policy approval required)',
    $$
    {
      "policyStatus": "required",
      "provisional": true,
      "scored": false,
      "blockedReason": "Trez must approve mixed-operation scheduling, difficulty, timing, remediation, and attempt rules before this practice can run."
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000011101',
    '10000000-0000-4000-8000-000000000111',
    'final-assessment-readiness',
    1,
    'article',
    'Final assessment readiness',
    $$
    {
      "summary": "The final assessment unlocks only after every prior module is fully completed.",
      "keyPoints": [
        "The default assessment lasts 30 minutes and randomly generates 2 to 6 operations.",
        "TRAINER may use Advanced Settings to change duration, operation range, and eligible operation types.",
        "A passing result requires 100%; unsuccessful attempts may be repeated without resetting completed modules.",
        "When time expires, the attempt ends as unsuccessful and retains completed and pending-operation evidence."
      ],
      "provisional": true,
      "scored": false
    }
    $$::jsonb,
    'draft',
    TRUE,
    FALSE
  ),
  (
    '10000000-0000-4000-8000-000000011102',
    '10000000-0000-4000-8000-000000000111',
    'final-assessment-policy-gated',
    2,
    'quick_simulation',
    'Final full-shift assessment',
    $$
    {
      "policyStatus": "required",
      "provisional": true,
      "scored": true,
      "blockedReason": "The final assessment remains unavailable until Reset Password, exceptional operations, mixed scheduling, scoring evidence, and runtime recovery gates are approved."
    }
    $$::jsonb,
    'draft',
    TRUE,
    TRUE
  )
ON CONFLICT (id) DO UPDATE
SET module_id = EXCLUDED.module_id,
    stable_code = EXCLUDED.stable_code,
    position = EXCLUDED.position,
    activity_type = EXCLUDED.activity_type,
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    publication_status = EXCLUDED.publication_status,
    is_provisional = EXCLUDED.is_provisional,
    is_scored = EXCLUDED.is_scored,
    updated_at = NOW();

INSERT INTO hub_module_prerequisites (
  course_id,
  module_id,
  prerequisite_module_id
)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000101'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000103',
    '10000000-0000-4000-8000-000000000102'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000104',
    '10000000-0000-4000-8000-000000000103'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000105',
    '10000000-0000-4000-8000-000000000104'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000106',
    '10000000-0000-4000-8000-000000000105'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000107',
    '10000000-0000-4000-8000-000000000106'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000108',
    '10000000-0000-4000-8000-000000000107'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000109',
    '10000000-0000-4000-8000-000000000108'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000110',
    '10000000-0000-4000-8000-000000000109'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000000110'
  )
ON CONFLICT (module_id, prerequisite_module_id) DO NOTHING;

INSERT INTO hub_assessment_settings (
  id, duration_minutes, minimum_operations, maximum_operations,
  operation_types, advanced_enabled, max_attempts_per_set,
  theory_weight, practical_weight, history_review_days, history_record_limit
)
VALUES (
  '10000000-0000-4000-8000-000000000301',
  30,
  2,
  6,
  ARRAY['ADD CREDITS', 'WITHDRAW CREDITS', 'CREATE ACCOUNT', 'REFRESH BALANCE', 'RESET PASSWORD']::TEXT[],
  FALSE,
  3,
  20,
  80,
  7,
  NULL
)
ON CONFLICT (id) DO UPDATE
SET duration_minutes = EXCLUDED.duration_minutes,
    minimum_operations = EXCLUDED.minimum_operations,
    maximum_operations = EXCLUDED.maximum_operations,
    operation_types = EXCLUDED.operation_types,
    advanced_enabled = EXCLUDED.advanced_enabled,
    max_attempts_per_set = EXCLUDED.max_attempts_per_set,
    theory_weight = EXCLUDED.theory_weight,
    practical_weight = EXCLUDED.practical_weight,
    history_review_days = EXCLUDED.history_review_days,
    history_record_limit = EXCLUDED.history_record_limit,
    updated_at = NOW();

INSERT INTO hub_game_family_adapters (
  id, stable_key, display_name, adapter_status, display_order, verified_at
)
VALUES
  (
    '10000000-0000-4000-8000-000000000501',
    'orion-stars',
    'Orion Stars',
    'verified',
    1,
    NOW()
  ),
  (
    '10000000-0000-4000-8000-000000000502',
    'golden-dragon',
    'Golden Dragon',
    'not_ready',
    2,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000503',
    'vblink',
    'Vblink',
    'not_ready',
    3,
    NULL
  )
ON CONFLICT (id) DO UPDATE
SET stable_key = EXCLUDED.stable_key,
    display_name = EXCLUDED.display_name,
    adapter_status = EXCLUDED.adapter_status,
    display_order = EXCLUDED.display_order,
    verified_at = EXCLUDED.verified_at,
    updated_at = NOW();

INSERT INTO hub_scored_evaluations (
  id, stable_code, title, position, evaluation_type,
  publication_status, is_provisional, duration_minutes,
  max_attempts_per_set, theory_weight, practical_weight, pass_score,
  game_family_selection_mode, selected_game_family_keys,
  prerequisite_module_ids, prerequisite_evaluation_ids, theory_item_codes,
  required_action_codes, practical_item_weights,
  history_review_days, history_record_limit
)
VALUES
  (
    '10000000-0000-4000-8000-000000000401',
    'checkpoint-game-platforms',
    'Checkpoint 1 — Game Platforms',
    1,
    'checkpoint',
    'draft',
    TRUE,
    30,
    3,
    20,
    80,
    100,
    'all_verified',
    ARRAY['orion-stars']::TEXT[],
    ARRAY[]::UUID[],
    ARRAY[]::UUID[],
    ARRAY[]::TEXT[],
    ARRAY[
      'CREATE_ACCOUNT',
      'SEARCH_USER',
      'VERIFY_BALANCE',
      'ADD_CREDITS',
      'WITHDRAW_CREDITS',
      'REVIEW_TRANSACTION_RECORDS',
      'RESET_PASSWORD_EDIT_INFORMATION'
    ]::TEXT[],
    '{"CREATE_ACCOUNT":15,"SEARCH_USER":10,"VERIFY_BALANCE":10,"ADD_CREDITS":15,"WITHDRAW_CREDITS":15,"REVIEW_TRANSACTION_RECORDS":10,"RESET_PASSWORD_EDIT_INFORMATION":5}'::JSONB,
    7,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000402',
    'checkpoint-operations',
    'Checkpoint 2 — Operations',
    2,
    'checkpoint',
    'draft',
    TRUE,
    30,
    3,
    20,
    80,
    100,
    'all_verified',
    ARRAY['orion-stars']::TEXT[],
    ARRAY[]::UUID[],
    ARRAY['10000000-0000-4000-8000-000000000401']::UUID[],
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[],
    '{}'::JSONB,
    7,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000403',
    'checkpoint-movements-customer-experience',
    'Checkpoint 3 — Movements and Customer Experience',
    3,
    'checkpoint',
    'draft',
    TRUE,
    30,
    3,
    20,
    80,
    100,
    'all_verified',
    ARRAY['orion-stars']::TEXT[],
    ARRAY[]::UUID[],
    ARRAY['10000000-0000-4000-8000-000000000402']::UUID[],
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[],
    '{}'::JSONB,
    7,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000404',
    'final-pretraining-readiness',
    'Final Pre-Training Readiness Assessment',
    4,
    'final_readiness',
    'draft',
    TRUE,
    30,
    3,
    20,
    80,
    100,
    'all_verified',
    ARRAY['orion-stars']::TEXT[],
    ARRAY[]::UUID[],
    ARRAY['10000000-0000-4000-8000-000000000403']::UUID[],
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[],
    '{}'::JSONB,
    7,
    NULL
  )
ON CONFLICT (id) DO UPDATE
SET stable_code = EXCLUDED.stable_code,
    title = EXCLUDED.title,
    position = EXCLUDED.position,
    evaluation_type = EXCLUDED.evaluation_type,
    publication_status = EXCLUDED.publication_status,
    is_provisional = EXCLUDED.is_provisional,
    duration_minutes = EXCLUDED.duration_minutes,
    max_attempts_per_set = EXCLUDED.max_attempts_per_set,
    theory_weight = EXCLUDED.theory_weight,
    practical_weight = EXCLUDED.practical_weight,
    pass_score = EXCLUDED.pass_score,
    game_family_selection_mode = EXCLUDED.game_family_selection_mode,
    selected_game_family_keys = EXCLUDED.selected_game_family_keys,
    prerequisite_module_ids = EXCLUDED.prerequisite_module_ids,
    prerequisite_evaluation_ids = EXCLUDED.prerequisite_evaluation_ids,
    theory_item_codes = EXCLUDED.theory_item_codes,
    required_action_codes = EXCLUDED.required_action_codes,
    practical_item_weights = EXCLUDED.practical_item_weights,
    history_review_days = EXCLUDED.history_review_days,
    history_record_limit = EXCLUDED.history_record_limit,
    updated_at = NOW();
