# Administrator guide
## Settings (one line each, in the server environment)
1. APPROVAL_CHAIN: single (default) or two.
2. PLACES_MODE: list (default) or free.
3. COST_CENTRE: off (default), optional or required. VEHICLE_TYPES: comma list.
4. DRIVER_ACCEPT: auto (default) or accept.
5. NOTIFY: off (default) or inapp.
6. ROUTING: straight (default) or road, with ROUTING_URL.
7. TRACKING: phone (default) or tracker, with TRACKER_TOKEN of 16 or more characters.
8. ROTABLES: off (default) or on.
9. RETENTION_DAYS: default 730. Run the retention script as a dry run first.

## Database
Run the three files in the database folder in order before first use in live mode.

## People and places
Import people from the template with the import script; keep places in the Places screen.

> CAUTION Passwords and tokens live only in the server environment, never in the repository.
