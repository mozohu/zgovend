# Architecture Overview (Mock)

## Scope
This document describes the high-level system structure for the LIFF backend and machine integration based on backend-spec v0.3.

## Roles
- Consumer: report issues and view case status/replies.
- Operator: manage product master and reservation templates.
- Replenisher: generate pick lists and perform on-site replenishment.

## Core Components
- LIFF clients
  - Consumer LIFF
  - Operator LIFF
  - Replenisher LIFF
- Backend services
  - Auth/Identity (LINE userId)
  - Customer Service
  - Product Master
  - Reservation Templates
  - Replenishment Session
  - Machine Registry
- Data stores
  - Backend DB (products, templates, tickets, reports)
  - Object storage (images, attachments)
- Machine side
  - Machine runtime
  - Local DB (real-time inventory, replenishment writes)
- Integration layer
  - MQ/Web Services for data sync between backend and machines

## Data Ownership
- Backend DB is the source of truth for product master and reservation templates.
- Machine local DB is the source of truth for real-time inventory during sales.
- Replenishment writes are only committed to machine local DB after session end.

## Key Data Flows
- Consumer support ticket: LIFF -> Backend -> DB (attachments in object storage).
- Operator product/template management: LIFF -> Backend -> DB.
- Replenisher pick list: LIFF -> Backend -> DB + machine data aggregation.
- Replenishment on-site: LIFF -> Backend (validate) -> Machine (write on session end).

## Constraints
- Permissions are enforced by backend based on role and data scope.
- Replenishment writes are blocked in sales mode and require on-site check-in.
