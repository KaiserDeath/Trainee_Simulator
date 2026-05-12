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

Important architectural clarification:

The simulator is not meant to reproduce gambling gameplay itself.
It simulates the operational/admin backoffice panels used by operators to manage customer accounts and requests.

The generated histories and logs primarily exist for realism and workflow context, not for deep fraud analysis.

Each trainee session should feel alive and realistic:
- incoming operations,
- existing histories,
- customer balances,
- simulated game records,
- and active accounts should already exist before the trainee starts processing requests.

The trainee should feel like they entered a live operational environment already in progress.
