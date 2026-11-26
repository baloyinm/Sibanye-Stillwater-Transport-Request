# Specification
## Scope
Request, approve, assign driver and vehicle, drive, track, report. Four roles: requester, supervisor, controller, driver.

## Statuses
Waiting for approval, Endorsed (two-step only), Approved, Offered (driver-accept only), Driver assigned, On the way, Completed, Rejected, Cancelled. Completed, Rejected and Cancelled are final.

## Rules
1. A driver can hold only one trip at a time (an offer counts).
2. Only the assigned driver can start or complete a trip.
3. A requester sees only their own trips; a driver sees only trips given to them.
4. Distances are straight-line unless a routing service is connected.
5. Sign-in is throttled after repeated failures; passwords are stored hashed.

## Settings
APPROVAL_CHAIN, PLACES_MODE, COST_CENTRE, VEHICLE_TYPES, DRIVER_ACCEPT, NOTIFY, ROUTING, TRACKING, ROTABLES, RETENTION_DAYS. See the Administrator Guide.
