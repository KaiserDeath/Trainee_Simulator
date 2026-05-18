# Casino Operator Training Simulator (Sandbox)

## Project Vision

This project is not a real casino platform.

It is a sandbox-based training simulator designed to evaluate and improve the performance of casino backoffice operators (trainees).

The system simulates a realistic casino support environment where trainees must manually process customer operations while handling pressure, validating balances, reviewing transaction history, and making correct operational decisions.

Every trainee operates inside an isolated temporary sandbox session.

At the end of the session:

- the sandbox is destroyed,
- scores and analytics are preserved,
- and the trainee must start again from a fresh seeded environment.

The goal is to measure:

- accuracy,
- speed,
- decision-making,
- operational consistency,
- and ability to detect incorrect or suspicious requests.

---

# Core System Philosophy

The platform is session-simulation-centric.

It is NOT:

- a banking platform,
- a production casino backend,
- or a persistent transactional system.

Instead, the application generates temporary simulated realities for trainees.

Each session:

- starts from a baseline seed,
- contains simulated customers,
- includes historical transactions,
- generates random operational requests,
- simulates game activity,
- and evaluates trainee decisions.

Every trainee session must feel like operating a live casino backoffice.

---

# Sandbox Lifecycle

## 1. Session Start

When a trainee starts a session:

- A new isolated sandbox is created.
- Seeded customers and accounts are cloned.
- Existing transaction history is generated.
- Historical gameplay activity is generated.
- Initial balances and logs are prepared.
- Background game simulators begin running.
- The Game Master begins injecting random operations.

Important:
The sandbox must already contain realistic historical transaction history before the trainee receives the first request.

This history is critical because operators must validate requests using:

- movement history,
- gameplay activity,
- current balances,
- and previous operations.

The trainee should never begin with an empty environment.

---

## 2. Runtime Simulation

During the session:

- simulated game activity continues,
- balances evolve,
- requests appear dynamically,
- edge cases may occur,
- fraud-like scenarios may be injected,
- and trainees must manually process requests.

All actions are manual.

The system never auto-completes operations.

The trainee must:

- investigate,
- validate,
- compare balances,
- review logs,
- and choose an action.

Possible actions include:

- Approve,
- Complete,
- Cancel,
- Reject.

---

## 3. Session Completion

When the session ends:

- the sandbox can be destroyed,
- temporary customers can be deleted,
- temporary operations can be deleted,
- temporary logs can be deleted.

Only trainee analytics and reports persist.

The next session starts from the same baseline conditions but with:

- new randomized operations,
- different timings,
- different customer activity,
- different request combinations,
- and potentially different difficulty conditions.

This guarantees replayability and prevents memorization.

---

# Frontend Structure

## OPERATIONS Section

### Movements Tab

Used for credit operations.

Examples:

- Add Credits
- Withdraw Credits

Operators must:

- verify balances,
- review movement history,
- inspect game activity,
- and decide whether the request should be approved or cancelled.

---

### Requests Tab

Used for manual technical requests.

Examples:

- Create Account
- Refresh Balance
- Reset Password

These requests may depend on validating customer data and game activity.

---

# CUSTOMER Section

## Customer Search

Search users by:

- email,
- username,
- or customer identifiers.

---

## Customer Header

Displays:

- username,
- first name,
- last name,
- current balance,
- and account status.

---

## History View

### Movement History

Shows:

- deposits,
- withdrawals,
- approved operations,
- cancelled operations,
- and generated transaction history.

This history exists BEFORE the trainee starts processing requests.

Historical movement generation is a required part of sandbox creation.

---

### Game Logs

Shows simulated activity from the supported game simulators.

Examples:

- wagers,
- wins,
- losses,
- jackpots,
- balance refreshes,
- delayed updates.

These logs help trainees determine whether balances are valid.

---

## Games View

Displays active game accounts and simulated game information.

Supported simulated platforms currently include:

- Orion Stars
- Vblink
- Golden Dragon

---

# Backend Simulation Engine

## Game Master

The Game Master is the central simulation orchestrator.

Responsibilities:

- inject random operations,
- generate runtime events,
- simulate realistic workloads,
- trigger edge cases,
- create pressure scenarios,
- and maintain session activity.

The Game Master should eventually evolve from a random generator into a scenario orchestration engine.

---

# Session Isolation

Each trainee session is fully independent.

10 trainees running simultaneously should experience:

- separate customers,
- separate balances,
- separate operations,
- separate histories,
- and separate simulated gameplay.

No trainee action should affect another trainee environment.

---

# Scoring System

The platform evaluates trainees using:

## Accuracy

Measures whether the trainee made the correct operational decision.

Examples:

- approving valid requests,
- cancelling invalid withdrawals,
- detecting balance inconsistencies,
- identifying suspicious activity.

---

## Speed

Measures:

- response time,
- processing time,
- and operational efficiency.

Timing starts the moment the request appears.

---

## Traceability

Every trainee action is logged.

Examples:

- processed operations,
- timestamps,
- decisions,
- correctness,
- and workflow actions.

---

# Long-Term Vision

The system should eventually support:

- difficulty modes,
- fraud scenarios,
- overload simulations,
- VIP customer handling,
- advanced analytics,
- trainer dashboards,
- session replay,
- AI-generated scenarios,
- and performance trend analysis.

---

# Architectural Principles

## Important Principle #1

The session is temporary.

The sandbox is disposable.

Only reports and trainee analytics persist.

---

## Important Principle #2

The seed world remains stable.

Randomized events create replayability.

---

## Important Principle #3

The trainee must always have enough historical information to make operational decisions.

This means:

- seeded movement history,
- pre-generated game logs,
- and historical balance activity
  must already exist when the session starts.

---

## Important Principle #4

The simulation engine is the real product.

The database is primarily:

- runtime state,
- sandbox memory,
- and evaluation storage.

---

# Final Summary

This project is a real-time operational training simulator for casino backoffice trainees.

It combines:

- isolated sandbox environments,
- dynamic operation generation,
- simulated gameplay activity,
- customer management workflows,
- and trainee evaluation systems.

The purpose is to simulate realistic operational pressure while measuring trainee performance in a controlled environment.

The simulator focuses specifically on frontline operational workflows rather than fraud investigation or payment analysis.

Operators are trained to:

- manage balances,
- process requests,
- navigate game platform backoffices,
- and complete workflows efficiently and accurately.

The core operational modules are:

## Movements

- Add Credits
- Withdraw Credits

## Requests

- Create Account
- Reset Password
- Refresh Balance

The trainee is not expected to deeply audit gameplay records or perform fraud analysis.

Game history and transaction records primarily exist to:

- provide realism,
- simulate authentic platform environments,
- and help operators understand customer context.

The supported platforms currently being simulated are:

- Orion Stars
- Vblink
- Golden Dragon

The goal is to emulate the actual backoffice systems used by operators within those gaming platforms.

---

# Conversation Recovery Prompt

Use the following prompt if this conversation is lost and you need to restore project context quickly:

I am building a sandbox-based casino backoffice operator training simulator.

The project is NOT a real casino backend.

The goal is to train frontline operators/trainees that work inside gaming platform backoffice panels such as Orion Stars, Vblink, and Golden Dragon.

The simulator focuses specifically on operational workflows, not fraud investigation or payment analysis.

Core operation modules:

1. Movements

- Add Credits
- Withdraw Credits

2. Requests

- Create Account
- Reset Password
- Refresh Balance

The trainee operates inside a temporary isolated sandbox session.

Each session:

- clones seeded customer/account data,
- starts with pre-generated transaction history,
- starts with existing gameplay logs/history,
- generates randomized incoming operations,
- simulates realistic operator workloads,
- evaluates speed and accuracy,
- and resets completely after completion.

The sandbox is disposable.
Only trainee reports/scores persist.

The purpose of the simulator is:

- workflow familiarity,
- operational speed,
- queue handling,
- platform navigation,
- and operational accuracy.

The trainee is NOT expected to deeply investigate gameplay or detect fraud.

The system architecture should focus on:

- isolated session sandboxes,
- runtime operation generation,
- simulated backoffice environments,
- scoring/evaluation systems,
- and realistic operational workflows.

The frontend structure contains:

- Operations section
- Customer section
- Movements tab
- Requests tab
- Customer search
- Games view
- Transaction history

The supported simulated platforms currently are:

- Orion Stars
- Vblink
- Golden Dragon

The UI inspiration comes from real casino/sweepstakes backoffice management systems.

The project stack currently uses:

- Node.js
- Express
- Supabase
- React/Vite frontend

Please continue helping me architect and develop this simulator from this context instead of restarting from scratch.
