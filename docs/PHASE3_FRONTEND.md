# Phase 3 Frontend Architecture

## Boundary

The React app is a rendering and interaction layer. It never imports backend domain code, never computes authoritative SLA metrics, and never connects to Firestore.

```text
React UI → typed API client → Phase 2 HTTP API → Firestore
```

## State model

### Application state

- no upload: show upload screen
- persisted upload ID: restore metadata through `GET /uploads/{id}`
- active upload: show dashboard

Only the upload ID is persisted client-side. No CSV contents or observation records are stored in `localStorage`.

### Dashboard query state

- applied date filter: single date or inclusive range
- service filter: logs only
- page size: logs only
- current summary response
- cached log pages for browser Previous navigation

Changing a filter resets the cursor/page cache to avoid mixing cursor query contexts.

## API error model

`ApiError` preserves:

- HTTP status
- backend error code
- safe user-facing message
- request ID
- optional details

Request IDs are shown in error UI for support/debugging without exposing stack traces.

## Upload design

Client-side validation is convenience only:

- `.csv` suffix
- non-empty file
- ≤ 5 MiB

The backend remains authoritative for schema, row count, timestamps, latency, HTTP status and persistence.

## Pagination

The backend has forward opaque cursors. The frontend caches already fetched pages:

```text
page 1 → cursor → page 2 → cursor → page 3
  ↑                  ↑
  └──── cached Previous navigation ────┘
```

No cursor is reused after date/service/page-size filters change.

## Accessibility

- upload dropzone supports Enter/Space
- summary uses `aria-expanded`/`aria-controls`
- forms use visible labels
- errors use `role=alert`
- log pagination uses `nav`
- logs use semantic table headers
- status badges contain text, not color alone
- reduced-motion CSS is respected

## Deliberate exclusions

- no authentication or accounts
- no multi-tenancy
- no charts library
- no dark mode
- no frontend state-management dependency
- no UI component framework
- no direct Firestore SDK in browser
