# Trainee Action Audit Log System

## Overview
This system records and displays all significant actions taken by trainees during training sessions, including:
- **USERNAME_COPIED**: When a trainee copies a customer or game account username
- **OPERATION_ACCEPTED**: When an operation is approved by the trainee
- **OPERATION_REJECTED**: When an operation is rejected/failed
- **OPERATION_CANCELLED**: When an operation is cancelled

## Database Setup

### 1. Create the trainee_action_logs table

Run the migration SQL in your Supabase SQL editor:

```bash
# Option A: Through Supabase UI
1. Go to Supabase Dashboard → SQL Editor
2. Open a new query
3. Copy the contents of backend/src/seed/migrations.sql
4. Execute the query
```

**OR**

```bash
# Option B: Using psql CLI
psql postgresql://[user]:[password]@[host]/[database] < backend/src/seed/migrations.sql
```

### SQL Migration Details

The table schema includes:
- `id`: UUID primary key
- `session_id`: Foreign key to trainee_sessions
- `trainee_id`: Trainee UUID (optional)
- `trainee_name`: Trainee name for quick reference
- `operation_id`: Foreign key to sandbox_operations (nullable)
- `action_type`: String enum-like (USERNAME_COPIED, OPERATION_ACCEPTED, etc.)
- `details`: JSONB field for action metadata
- `timestamp`: Exact ISO timestamp of the action
- `created_at`: Log entry creation timestamp

Indexes are created for efficient querying by:
- session_id (most common query)
- operation_id
- action_type
- timestamp (for sorting)

## Frontend Components

### AuditLogPanel (`frontend/src/components/audit/AuditLogPanel.jsx`)

Displays the audit log for a session with:
- Trainee name
- Action type (with emoji indicator)
- Exact timestamp (formatted as HH:MM:SS)
- Action details (username, operation type, etc.)

**Features:**
- Auto-refreshes every 5 seconds
- Sortable by timestamp
- Shows formatted action details

## Backend Integration

### AuditLogger Engine (`backend/src/engine/AuditLogger.js`)

Provides two main functions:

#### `logActionEvent(payload)`
Logs a single trainee action event.

```javascript
import { logActionEvent } from '../engine/AuditLogger.js';

await logActionEvent({
  sessionId: 'uuid-123',
  traineeId: 'uuid-456',        // optional
  traineeName: 'John Doe',
  operationId: 'uuid-789',      // nullable for session-level actions
  actionType: 'USERNAME_COPIED', // or OPERATION_ACCEPTED, etc.
  details: {                     // optional JSON details
    username: 'customer_001',
    operationType: 'ADD CREDITS',
    timestamp: new Date().toISOString()
  }
});
```

#### `getSessionActionLog(sessionId)`
Retrieves all action logs for a session.

```javascript
const logs = await getSessionActionLog('uuid-123');
// Returns array sorted by timestamp
```

## API Endpoints

### POST `/trainer/sessions/:id/log-action`
Log a trainee action from the frontend.

**Request Body:**
```json
{
  "actionType": "USERNAME_COPIED",
  "details": {
    "username": "customer_001",
    "operationId": "uuid-789"
  }
}
```

**Response:**
```json
{
  "message": "Action logged"
}
```

### GET `/trainer/sessions/:id/audit-log`
Retrieve all audit logs for a session.

**Response:**
```json
[
  {
    "id": "uuid-1",
    "session_id": "uuid-123",
    "trainee_name": "John Doe",
    "action_type": "USERNAME_COPIED",
    "details": "{\"username\": \"customer_001\"}",
    "timestamp": "2024-01-15T10:30:45.123Z"
  },
  ...
]
```

## Frontend Integration Points

### OperationCard Component
When trainee clicks the copy button (📋), it automatically:
1. Copies username to clipboard
2. Calls `logTraineeAction()` with USERNAME_COPIED action
3. Shows success notification

### DashboardPage Dashboard Tabs
New "Audit Log" tab displays the full session audit log with:
- Real-time updates every 5 seconds
- Formatted timestamps
- Action details display

## Usage Example

### From Frontend (OperationCard)
```javascript
import { logTraineeAction } from "../../api/client";

const handleCopyUsername = async () => {
  const username = operation.customer?.username || operation.game_account?.game_username;
  
  if (username) {
    await navigator.clipboard.writeText(username);
    
    await logTraineeAction(
      session.id,
      'USERNAME_COPIED',
      {
        operationId: operation.id,
        operationType: operation.type,
        username,
        timestamp: new Date().toISOString()
      }
    );
  }
};
```

### From Backend (Operation Processing)
```javascript
import { logActionEvent } from '../engine/AuditLogger.js';

// In operationService.js processOperation()
await logActionEvent({
  sessionId: operation.session_id,
  traineeName,
  operationId: operation.id,
  actionType: action,        // 'APPROVE' or 'REJECT'
  details: {
    operationType: operation.type,
    isCorrect,
    processingSeconds
  }
});
```

## Action Type Definitions

| Action Type | Trigger | Source | Details Captured |
|---|---|---|---|
| `USERNAME_COPIED` | Trainee clicks copy button | Frontend | username, operationId, operationType, timestamp |
| `APPROVE` | Operation processed successfully | Backend | operationType, isCorrect, processingSeconds |
| `REJECT` | Operation processing fails | Backend | operationType, isCorrect, processingSeconds |
| `CANCEL` | Trainee cancels operation | Frontend | operationId, reason (optional) |

## Performance Considerations

- **Index Strategy**: Session_id is the primary query filter (most sessions have 10-100 operations)
- **JSONB Details**: Flexible schema allows future expansion without schema changes
- **Cascade Delete**: Audit logs automatically deleted when sessions are deleted
- **Query Performance**: Typical session audit log query returns <500 records, < 100ms

## Future Enhancements

Potential additions:
1. Filtering by action type in UI
2. Export audit logs to CSV/JSON
3. Trainee performance analytics based on action logs
4. Real-time WebSocket updates for audit log
5. Admin-only viewing of all session audits
