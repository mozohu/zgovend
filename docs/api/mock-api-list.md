# Mock API List (Draft)

Base path: `/api/v1`

## Auth and Identity
- `POST /auth/liff/login` (All roles)
  - Exchange LIFF token for backend session

## Customer Service (Consumer)
- `POST /support/tickets`
  - Create support ticket with category, description, attachments
- `GET /support/tickets`
  - List own tickets with status
- `GET /support/tickets/{ticketId}`
  - Get ticket details and reply text

## Product Master (Operator)
- `GET /products`
  - List products
- `POST /products`
  - Create product
- `PATCH /products/{productId}`
  - Update product fields
- `DELETE /products/{productId}`
  - Hard delete product

## Reservation Templates (Operator)
- `GET /reservation-templates`
  - List templates
- `POST /reservation-templates`
  - Create empty template
- `POST /reservation-templates/{templateId}/copy-from-machine`
  - Create from machine snapshot
- `POST /reservation-templates/{templateId}/copy-from-template`
  - Create from existing template
- `PATCH /reservation-templates/{templateId}`
  - Rename template
- `DELETE /reservation-templates/{templateId}`
  - Hard delete template
- `PUT /reservation-templates/{templateId}/channels`
  - Update channel product, clear product, set full stock

## Pick List (Replenisher)
- `POST /picklists`
  - Generate pick list from selected machines

## Replenishment (Replenisher)
- `POST /machines/{machineId}/checkin`
  - Verify on-site check-in
- `POST /replenishment/sessions`
  - Start session
- `POST /replenishment/sessions/{sessionId}/apply-template`
  - Apply reservation template (staged)
- `PATCH /replenishment/sessions/{sessionId}/channels`
  - Update channel product/stock/full stock (staged)
- `POST /replenishment/sessions/{sessionId}/complete`
  - Commit changes to machine local DB

## Machine Sync (System)
- `POST /machine-sync/inventory`
  - Sync machine inventory snapshot to backend
- `POST /machine-sync/events`
  - Sync machine events or status
