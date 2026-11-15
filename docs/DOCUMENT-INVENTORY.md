# Document and message inventory

Every document and message this project produces, its family and what builds it. Rules: `rules/reuse-rule` D1 to D5 (documents) and E1 to E4 (messages). Kept current in the same commit as any change.

## Documents

None. The app takes transport requests and shows them on screen; `templates/*.csv` are import templates (data files, not documents). No PDF, Word or printable record is produced. If a trip sheet or request form is added, build it with `email/document-style-kit` and list it here. This repository is public: documents made later must never contain real names, ID numbers or contact details in the repository.

## Messages

None. Requests are shown in the app; no email, SMS or push is sent. If sending is ever added it must use `email/message-channels-kit` with the `integrations/email-sms-messaging` delivery-mode guard (default `COMMS_MODE=redirect`), and this file is updated in the same commit.
