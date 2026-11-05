# 06 Security and Data Control — Sequence Diagrams

Module 06 of the [context model](../context.md). The product never holds a bank or Gmail
password. Its only standing access is the Gmail ingest token (01-S08a), which is stored
only as a hash and can be revoked at any time.

---

### 06-S02 — See and revoke the Gmail connection

**Story:** As Patricia, I want to see exactly what the product can currently access and
withdraw any of it immediately so that I can decide what it may see and change my mind
whenever I want.

Revoking deletes the token's hash. Every `/ingest/gmail` call looks the hash up, so the
next call from the script is rejected with no delay.

```mermaid
sequenceDiagram
    autonumber
    actor U as Patricia
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant CS as ConnectionService
    participant Ing as Ingestion
    participant GS as Gmail Apps Script

    U->>UI: Open "Connections"
    UI->>Web: GET /api/connections
    Web->>API: GET /api/connections
    API->>CS: list(userId)
    CS->>Ing: Query CONN#
    CS-->>UI: Gmail connection with status, token prefix, lastSeenAt
    U->>UI: Revoke Gmail
    UI-->>U: "New bank emails will stop arriving. Imported transactions stay."
    U->>UI: Confirm
    UI->>Web: DELETE /api/connections/id
    Web->>API: DELETE /api/connections/id
    API->>CS: revoke(userId, connId)
    CS->>Ing: TransactWriteItems
    Note right of Ing: Delete TOKEN#hash,<br/>Update CONN#gmail#id (REVOKED)
    CS-->>UI: 200 revoked
    GS->>API: POST /ingest/gmail (old token)
    API->>CS: authenticate(token)
    CS->>Ing: Get TOKEN#hash
    Ing-->>CS: Not found
    CS-->>GS: 401, the script stops its trigger
```
