# Trez Operator Backend Guide — Extracted Product Requirements

Status: Draft extraction for Trez validation  
Source: `C:/Users/OS/Downloads/Guia de Operador Backend.pptx`  
Source reviewed: All 18 slides on 2026-08-19

## Purpose and precedence

This document translates the Operator Backend guide into product requirements for Trez Training Hub. It does not treat slide screenshots, example credentials, example passwords, or temporary production data as implementation instructions.

Direct decisions from Trez take precedence. The confirmed curriculum order is:

1. Module 1: explanation of the work, how the casino ecosystem operates, and what Trez expects from operators.
2. Module 2: practical operator orientation, video, guided content, or quick simulation that previews the complete job and the operations taught later.
3. Module 3: Account Creation.
4. Module 4: Search for Customer.
5. Module 5: Refresh Balance.
6. Module 6: Add Credits.
7. Module 7: Withdraw Credits.
8. Module 8: Reset Password.
9. Module 9: Exceptional and advanced operations.
10. Module 10: Mixed-operation practice.
11. Module 11: Final full-shift assessment.

The Basic Actions / Game Functionalities slide is a capability inventory, not a module sequence. Its reusable capabilities include:

- Create a player.
- Search for and confirm that same player.
- Read the current balance.
- Use supported add/recharge/set-score functionality.
- Use supported withdraw/redeem/set-score functionality.
- Review score, transaction, recharge–redeem, or operation history.
- Reset a password or edit/update information where supported.

Module 2 previews the complete operator job. Each later module references the capabilities it needs to teach and assess its operation or applied skill. Capability definitions and game-specific mappings must be maintained once and reused without redundancy.

Module 3 Account Creation uses the existing Account ID Lab at `C:/Users/OS/PROYECTOS/Evaluations` to teach account structures. The trainee then applies that learning inside the Operator Training Simulator at `C:/Users/OS/PROYECTOS/Simulador-dos` and completes the originating Trez Backend request. The created training account is preserved for Module 4, where the trainee learns to search for and positively confirm that same customer.

## Module 1 business foundation

Module 1 should teach the context a trainee needs before seeing detailed Backend procedures:

- How customers, Trez, companies/licenses, and game platforms interact.
- How the customer's general balance differs from the balance held in an individual game.
- Why Transactions, Movements, and Requests exist.
- What the operator is responsible for verifying, performing, recording, and escalating.
- Why financial accuracy, customer identity, correct licensed access, traceability, credential protection, and confidentiality matter.
- What Trez expects in daily work: follow procedures, verify before acting, avoid duplicate operations, work accurately and efficiently, and escalate situations that cannot be safely verified.
- Which mistakes are considered critical and why they can affect customer funds or account access.

Module 1 should use explanatory content, examples, and a knowledge check. It should not require the simulator or teach detailed button-by-button navigation; that belongs in Module 2 and the relevant complete operation modules.

## Domain model required by the guide

The product needs first-class records for:

- Company.
- License or licensed entity.
- Game family.
- Game platform.
- Customer.
- Customer game account and platform identifier.
- Backend operation.
- Game-side action and history record.
- Backend customer history record.
- Operator or trainee attempt evidence.

An operation and an exercise must carry company/license context. Selecting the right game name without selecting the correct licensed access is not enough.

## Game-family baseline

The guide groups platforms into these seven baseline families:

1. Orion Stars / Fire Kirin.
2. Golden Dragon.
3. Ultra Panda / Vblink.
4. Game Vault.
5. Game Room.
6. Fortune2Go.
7. Blue Dragon.

The guide also uses additional platform abbreviations in account-creation examples. Trez must provide the canonical catalogue and approve family membership, abbreviations, and naming rules before they are encoded.

Game adapters must normalize platform-specific terms for:

- Creating a player.
- Searching for a customer or player.
- Reading the current balance.
- Adding or recharging credits.
- Withdrawing or redeeming credits.
- Reading score, transaction, operation, or recharge/redeem history.
- Editing customer information or resetting a password.

## Backend areas to teach

Module 2 content should turn the Module 1 concepts into a visible operator workflow and introduce:

- Using the assigned Backend account and role.
- Accessing companies/entities and their licenses.
- Selecting the license required by the workstation or supervisor.
- Searching for customers, commonly by email, and understanding the main customer fields.
- Customer transaction and movement history.
- Registered games, game credentials, and account maintenance.
- Change logs and permitted account actions.
- The three operation categories and their state rules.

## Operation taxonomy

### Transactions

- **Purchases:** real-money operations described as mostly automated.
- **Cashouts:** real-money operations with manual validation by payment analysts.

These are Hub curriculum requirements. They are outside the first recommended Account Creation vertical slice until Trez defines simulation scope and controls.

### Movements

- **Add Credits:** deduct credits from the general customer balance and add them to a game.
- **Withdraw Credits:** deduct credits from a game and add them to the general customer balance.

Only eligible pending Movements should be manually handled. The guide describes refreshing a Movement that remains in `Bot` for more than two minutes and handling it only if it does not disappear. The exact timer and resulting state transition require Trez confirmation.

### Requests

- **Create Account:** create a platform account using game-specific rules.
- **Refresh Balance:** update the platform balance so it matches the game.
- **Reset Password:** apply the game-specific reset policy.

Passwords and naming formulas must be configuration with controlled access, not constants scattered through interface code.

## Verification-first Movement workflow

Before mutating game state, the operator must:

1. Verify the operation type.
2. Verify the company/license.
3. Verify the game.
4. Verify the amount.
5. Copy the Mobile ID or game username.
6. Open the correct licensed game access.
7. Search for and positively confirm the customer/player.
8. Inspect the game-side score or transaction history.
9. Compare with the Trez customer history when the action may already exist or the evidence is uncertain.

The decision then branches:

- **Action not present:** perform it exactly once, recheck the history, and process the Movement in Trez Backend if the evidence is consistent.
- **Action already present:** do not repeat it; process only the Backend Movement after matching the evidence.
- **Evidence inconsistent or unverifiable:** do not mutate the balance; follow the Trez-approved escalation, cancellation, or retry procedure.

## Module 3 — Account Creation

Module 3 must maintain one continuous request and player-creation lifecycle across the Hub, Account ID Lab, simulator, and simulated Trez Backend:

1. The trainee receives a Create Account request in Trez Backend.
2. The trainee verifies the request state, customer, company/license, and requested game.
3. The linked Account ID Lab receives that customer and game context.
4. The trainee studies the applicable structure family and practices constructing valid identifiers.
5. The trainee passes a formative structure checkpoint using an approved, versioned rule.
6. The trainee opens the correct game backoffice in the simulator.
7. The trainee creates the player using the approved structure, or records the credentials generated by the game for auto-generated-login platforms.
8. The simulator preserves the returned username/Mobile ID and created account.
9. The trainee copies and records that exact identifier as Module 3 output.
10. The trainee returns to Trez Backend and completes the original request with the required information.

Module 3 must record the request context, account-policy version, Account ID Lab checkpoint, created identifier, copy event, Backend information, and final decision. It must detect a wrong structure, wrong game/license, unnecessary duplicate creation, or completing the wrong Backend request. Module 4 then adds the search and positive-identification evidence for that same player.

### Role of the Account ID Lab

The existing `Evaluations` application currently provides:

- A builder that explains how an account value is assembled.
- Three structure families: game-generated login, Orion Stars family, and standard structure.
- Game-to-account and account-to-game practice.
- Pattern validation that accepts any correctly sized random suffix.
- An editable game catalogue and rule tests.

This application is a learning activity within Account Creation, not its own curriculum module and not the complete evaluation. It teaches the rule; the simulator evaluates whether the trainee can apply it in the operational workflow.

Before formal assessment, the editable browser-local catalogue and working-assumption initials must be replaced by Trez-approved, server-held, versioned policies. Trainees must not be able to edit the rule used to score their own attempt. Progress and evidence must persist in the Hub rather than only in the browser.

## Module 4 — Search for Customer

Search for Customer is a focused applied-skill module rather than a Trez Backend operation category. It is placed immediately after Account Creation so the trainee searches for the player they created instead of an unrelated fixture.

The module must teach and assess:

1. Reading the customer, company/license, game, and identifier context.
2. Opening the correct licensed game backoffice.
3. Navigating to the applicable customer/player list.
4. Copying the exact created username or Mobile ID.
5. Pressing `Ctrl+F` and then `Ctrl+V` to search using that exact identifier.
6. Confirming the exact customer with the available supporting fields.
7. Recognizing no match, ambiguous match, wrong game/license, and exact-match outcomes.
8. Leaving the account unchanged when the assigned task is search and confirmation only.

The evidence trail must connect the searched identifier to the account created in Module 3 and record the copy, `Ctrl+F`, `Ctrl+V`, query, match, selected account, and final confirmation. This module owns the full instruction and assessment of the search procedure; later modules reuse the capability without duplicating the lesson unless remediation is required. If Module 4 is assigned independently, the Hub may provide a seeded training account but must record its origin.

## Module 6 — Add Credits

Module 6 must contain:

- Learning content explaining Add Credits and its effect on both balances.
- A demonstration or guided walkthrough of the complete verification-first flow.
- A guided scenario where the credits have not yet been added.
- A guided scenario where the credits were already added and only Backend acceptance remains.
- An independent assessment with the branch hidden from the trainee.
- Evidence and feedback for incorrect license, game, player, amount, missing history verification, duplicate action, and incorrect Backend decision.

The exercise should reveal only the Backend and game sections needed for Add Credits, but it must not remove the history and identity evidence required to make a safe decision.

## Required Trez validation

Before implementation, Trez must confirm:

1. Canonical companies, licenses, game families, platforms, and abbreviations used in training.
2. Exact eligible Backend states for every operation.
3. The `Bot` timeout and manual-takeover behavior.
4. Matching rules for deciding that an action already occurred, including time and amount tolerance.
5. Escalation/cancellation behavior for inconsistent evidence.
6. Which Transactions belong in learning content versus simulation.
7. Account-creation formulas and reset-password policy for each platform.
8. Which game family should be used for the first Account Creation production slice.
9. Which Account ID Lab initials, family assignments, and formulas are approved rather than working assumptions.
