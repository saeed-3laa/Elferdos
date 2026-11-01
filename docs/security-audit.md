# Security audit — Al-Ferdous Wholesale

## Cleanup follow-up — 1 November 2026

Migration 030 is applied only to the local Docker database. Retired inventory permissions are removed, explicitly denied and excluded from effective access. Stock import branches/schemas/parser code are removed from current execution. Staff with catalog.read see manual availability without gaining catalog.write. Atomic saves, revision guards and email/MFA/isolation checks remain. No financial functions, stored prices, inventory history or existing migrations were rewritten. Local results:314 unit/SQL tests passed, lint/typecheck passed, corrected connected subset22/22 passed after documented test-only corrections. This is not a full-suite or hosted-security result. See manual-availability-cleanup.md. minimatch, owner rollout, external backups and hosted verification remain open.


## Current follow-up, 31 October 2026

Migrations 028/029 are applied locally. The owner explicitly retired quantitative stock accounting: products.available is the manual ordering gate; order quantities, stored prices, idempotency, revision locks, payment/refund limits and customer isolation remain enforced. Submission, delivery, cancellation, amendment and return approval neither mutate nor create stock records. Old inventory tables are retained for history with client grants revoked, and legacy stock-update RPCs/imports are disabled. Availability changes require catalog.write and a current revision; the form saves product data and availability atomically. Current exports require catalog.read for products (no obsolete inventory permission) or customers.read for customers. Historical pre-028 stock claims below are superseded. See test-report.md for executed runs and reruns; hosting/owner/backup findings remain open.

### Medium M-04 — Newly reported transitive minimatch advisory (open)

The latest actual npm audit reported 19 moderate dependency-tree entries, zero high/critical, tracing to [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), published to the advisory database on 30 October 2026. The advisory describes excessive pattern preprocessing work and lists 11.0.1 as patched. This does not establish 19 independent application exploits. ExcelJS/archiver and development lint tooling appear in the affected tree. Evidence: package-lock.json and the local ignored test-results/security-audit-dependencies.json.

Source inspection found no application minimatch/glob API taking user-controlled patterns; the inspected ExcelJS streaming writer appends explicit entries. That is limited source evidence, not proof that every transitive path is unreachable. No denial-of-service payload was executed. Automatic fix suggestions include major downgrades of ESLint/ExcelJS, so no force fix or global breaking override was applied. Priority P1 before public deployment: review compatible dependency updates or a verified backport, preserve Excel streaming/import protection and lint/Next compatibility, rerun the affected tests and audit, and record accepted residual exposure if no compatible upstream fix is available. Older zero-audit results below are historical, not the current result.

Update, 30 October 2026: migrations 025–027 and the new cancellation/return/invoice/export surfaces were reviewed and tested locally. Customer cancellation checks ownership, CONFIRMED state and revision under an order lock; it releases reservations once. Return approval is staff-only and atomic across the request, stored sale-price quantities/totals, inventory, event, notification and audit. A customer request alone changes neither stock nor money. Payment history is retained; actual refunds are separate, bounded ledger entries. All approved goods return to stock by the owner's explicit policy; damaged-stock exclusion is not implemented.

The new invoice loader checks account kind, orders.read for staff and customer ownership/RLS; PDF is no-store with a fixed local embedded font and export quota. The complete report export requires customers.read, or both catalog.read and inventory.read. It excludes staff, writes text cells rather than formulas, streams keyset pages and retries only temporary read errors before committing rows. Migration 027 grants customer-read staff access only to the default saved address; other addresses remain customer-private. Return payloads are bounded before storage. Actual results, including a transient export failure and its follow-up, are recorded in test-report.md. Latest unit/SQL tests: 287; the full connected suite passed 70 before final PDF/read-recovery refinements, which received targeted reruns. H-01/H-02/H-03 remain open for hosted/real-owner evidence. The 023 recovery rehearsal was not rerun on 027.

Baseline: 28 October 2026, local repository after account separation migration 019. This is a source/configuration audit plus targeted local test evidence, not a penetration-test certification. No hosted production environment or cloud dashboard was available. No production data, credentials or secrets were changed or included in this report.

## Verified stack and boundaries

Next.js 16.4.3, React 19.3.1, Node 24 in CI, TypeScript 6, Supabase JS/SSR, Supabase Auth, PostgREST, PostgreSQL 17 local, Supabase Storage, Sharp, ExcelJS. No Prisma or separate backend. All current testing uses local Supabase and synthetic identities; public production must remain blocked until deployment requirements below are completed.

## Ranked findings at baseline — before the security hardening stage

### Critical

No Critical exploit was established in the reviewed paths and executed tests. This does not establish absence of Critical vulnerabilities outside the tested scope.

### High H-01 — Administrative MFA not required

Evidence: `src/server/auth/staff.ts` verifies active identity and role but has no second-factor requirement; `private.has_permission` in migration 019 checks the session/role only. Administrative Auth APIs are supported by the provider, but no enrollment/challenge UI or SQL AAL gate exists. Password compromise of an active owner grants privileged access. Priority P0 before public launch: add enrollment and challenge, enforce AAL2 in server authorization and sensitive database access, verify users can enroll before enabling mandatory policy. Never enable a policy that prevents the owner reaching enrollment.

### High H-02 — Production identity, perimeter and recovery configuration unverified

Evidence: `supabase/config.toml` deliberately contains a LOCAL-ONLY nonfunctional SMS-provider configuration; cloud Auth limits, confirmation settings, HTTPS/domain/proxy trust, preview isolation and provider dashboards have not been configured/inspected. Application login limits do not replace provider-side limits on directly accessible GoTrue endpoints. Priority P0: provision isolated cloud environments; configure real provider settings/limits and test phone/password flows; verify HTTPS and trusted forwarding on the chosen host. No claim of a working cloud auth configuration is made.

### High H-03 — No production database AND object-storage recovery policy

Evidence: `scripts/check-database-restore.mjs` is a guarded local rehearsal. No scheduled off-site backups, Storage copy, alerting, agreed RPO/RTO or production restore evidence exists. GitHub holds code, not orders/files. Priority P0: configure independent database/file backups and run an isolated restoration before launch. Do not treat database-only backup as image/document backup.

### Medium M-01 — Missing Content Security Policy and transport hardening header

Evidence: `next.config.ts` contains nosniff, frame denial, referrer and permissions headers, but no CSP/HSTS. `src/proxy.ts` refreshes sessions only. React escapes text, but there is no CSP defense in depth against injected scripts. Priority P1: per-request nonce CSP covering HTML, dynamic rendering, explicit allowed Storage origin, no unsafe-eval in production, and HTTPS-only transport header behavior. Verify hydration, images, forms and route transitions under enforcement.

### Medium M-02 — XLSX decompression trusts declared ZIP sizes

Evidence: `src/server/excel/workbook.ts:validateWorkbookArchive` bounds upload bytes and sums ZIP central-directory expansion sizes, then ExcelJS decompresses. Declared size is attacker controlled. No actual bounded decompression is performed before ExcelJS. The affected upload is privileged, reducing exposure, but a forged archive could consume process memory/CPU. Priority P1: validate local offsets/metadata and bound actual decompressed output before workbook loading; test forged size and expansion-limit failures. No live large-memory exploit was executed.

### Medium M-03 — Broad read/export workload lacks perimeter budget

Evidence: public search/catalog RPCs and `/api/search` can be requested outside the UI; private exports/import preview have per-request size limits but no shared route-wide concurrency budget. Order creation does have its own SQL quota; this finding is about read/processing abuse, not bypass of order reservation. Priority P1/P2: provider WAF/rate limits and monitoring at launch; worker/concurrency controls for larger files later. Do not trust arbitrary forwarded IP headers.

### Low L-01 — Missing explicit server-only markers in processing modules

Evidence: `src/server/excel/workbook.ts` and `src/server/storage/encode-image.ts` currently import no secrets and are used server-side, but lack a compiler-enforced server-only boundary. Existing Supabase privileged client is already marked server-only. Priority P2: add boundaries and a test-only marker alias so SQL/file unit tests remain executable.

### Low L-02 — Customer export includes staff for an owner

Evidence: customer list/details now filter `account_kind='CUSTOMER'`, while the `customers` export configuration in `src/app/admin/excel/export/route.ts` selects profiles without that explicit filter. RLS limits non-owner readers, but owner export mixes staff and customer contact data. Priority P2: filter the customer export and pricing-customer lookup consistently. No passwords are stored/exported in profiles.

### Low L-03 — Operational evidence still needed

No retention policy for audit logs/import snapshots, no hosted monitoring/budget configuration, no hosted load/scanner evidence, and no GitHub deployment/release gate was inspected. These are explicit launch tasks, not checks inferred to pass from build success.

## Controls inspected and evidence available at baseline

- Session cookies: HttpOnly, SameSite=Lax, Secure in production; clients are per-request; private responses no-store. Live session existence participates in SQL checks. Exact cloud expiration/refresh settings still need verification.
- Account separation: account_kind defaults CUSTOMER; public metadata cannot grant STAFF/OWNER; service-only provisioning plus owner action; revoked/disabled staff cannot fall back to shopping. Migration 019 also fixes legacy address RPCs to check live customer session before writing.
- Authorization: actions call requireCustomer/requireAccount/requireStaff; privileged RPCs recheck permissions and sensitive tables use RLS. Layout/proxy visibility is not the authority. Service-key operations are limited to server modules.
- Orders: SQL recalculates prices/totals, best eligible price without stacking, validates quantities/status/stock, compares quote, locks inventory, checks revision and idempotency. Payment completion and amendment/notification are atomic. Existing tests cover tampering, concurrent last-stock claims and cross-customer data.
- Input: Zod and SQL checks; PostgREST parameters; dynamic SQL sort identifier is whitelist-only; no raw client SQL interpolation.
- XSS/SSRF/redirect review: no dangerouslySetInnerHTML/eval or arbitrary remote URL fetch was found in src. Images use fixed validated Storage paths; navigation redirects use fixed local targets. React text output escapes strings. This is reviewed source evidence, not a claim that an automated scanner covered every payload.
- CSRF: current mutations use Next Server Actions with framework Origin/Host validation and SameSite cookies. Explicit Route Handlers are GET-only. Direct hostile-origin and unauthorized action replay tests are planned in the hardening stage.
- Files: image signatures/pixels/static formats verified, re-encoded to WebP with native limits; Storage writing service-only after staff permission; XLSX cell formulas/links/compound values rejected; exports write string cells rather than formulas. Actual ZIP-size gap is M-02 above.
- Dependencies: npm audit of the installed lockfile was executed; result 0 known vulnerabilities at baseline, including no High/Critical. This is a point-in-time registry result, not proof all dependencies are vulnerability-free.
- Tests: 228 unit/SQL checks passed after migration 019. Staff UI tests are still being completed; do not count unfinished runs as passing. Earlier app/UI results are in docs/test-report.md.

## Remediation stages

1. Preserve this baseline report and inventory before security changes.
2. Stage A: nonce CSP, HTTPS header behavior, server-only boundaries and export separation. Build and browser/security header checks.
3. Stage B: bounded real ZIP expansion and malformed archive tests. Unit/integration checks.
4. Stage C: MFA enrollment/challenge UI and SQL AAL2 enforcement with safe rollout. Test synthetic TOTP accounts; real administrators enroll their own devices. Enforce policy before launch.
5. Stage D: direct action replay/hostile Origin tests, cross-customer requests, secret-boundary checks, full lint/typecheck/unit/build/browser run, dependency audit and local restore rehearsal.
6. Deployment-only: real Auth settings, provider-level limits, TLS, isolated preview, backups/files/monitoring and controlled SQL deployment. Report these as pending until actually inspected/executed.

## Scope inventory

See `security-surface-inventory.json` for every current page, explicit Route Handler, Server Action export and SQL function definition source. Multiple migration definitions represent history; the last definition is effective. Inventory generation is not authorization verification by itself.

## Status after fixes

Baseline findings above are retained as the pre-fix report. Changes below were applied in source/migration stages on local development only.

### Implemented stages and current finding disposition

- **H-01: implementation complete; production activation still required.** Migrations 020–023 add an AAL2 database permission boundary, enrollment-aware MFA, verified-email readiness and service-only deployment readiness. `src/server/auth/staff.ts` checks the same policy before privileged loaders/actions. `src/server/auth/credential-assurance.ts` protects own password/contact/email changes against a password-only action replay; enrollment remains reachable at AAL1. A verified staff factor requires AAL2 even with the global rollout switch off. Password recovery does not remove TOTP. No real user was enrolled or confirmed on their behalf. Mandatory policy for all active staff is a launch requirement, not enabled on the existing unprepared owner.
- **H-02: remains a launch blocker.** Email-only staff provisioning and verification are implemented in `src/app/admin/staff/actions.ts`, `src/app/security/email/actions.ts`, `src/app/auth/confirm/route.ts` and migration 022. Real SMTP, delivery to the owner's actual inbox, cloud Auth limits, trusted ingress, HTTPS and provider policies still need hosted evidence. A Mailpit confirmation does not prove ownership of a real external inbox.
- **H-03: local recovery proven; production operation remains a launch blocker.** Database restoration to a new isolated database and restoration of 2 referenced product images to a new private Storage bucket succeeded; restored SHA-256 values matched their backups. Originals were unchanged. See `scripts/check-database-restore.mjs` and `scripts/check-storage-restore.mjs`. This is not scheduled/off-site backup, not a backup of unreferenced objects, and not a production RPO/RTO guarantee.
- **M-01: fixed and browser tested.** `src/proxy.ts` supplies a unique per-response nonce to Next and response headers; `src/domain/security-headers.ts` defines CSP. Production disallows unsafe-eval. Image/connect targets are the configured backend plus explicit data/blob/local allowances; frames/objects/base overrides are denied. Dynamic HTML prevents nonce reuse through static HTML. Styles retain unsafe-inline for current UI compatibility. HSTS is sent in production without broad includeSubDomains/preload. Hosted TLS termination still needs verification.
- **M-02: fixed and tested.** `src/server/excel/workbook.ts` bounds real deflate output to a total 10 MiB before ExcelJS, validates local/central metadata and spans, and rejects duplicate/traversal names, encrypted data, macros and external links. Tests include a compressed stream with a false declared expansion size. Isolated processing workers remain an operational improvement.
- **M-03: reduced in application; hosted perimeter remains required.** `src/server/auth/workload-limit.ts` uses shared SQL counters. Search: 240 requests/minute per account, with one shared anonymous bucket; exports: 30/15 minutes; import previews: 12/15 minutes; image operations: 40/15 minutes. These are initial budgets, not a capacity promise. Export excess returns 429/Retry-After. Direct Supabase endpoints and DDoS require provider limits/WAF/monitoring; anonymous exhaustion of a shared budget can affect other visitors.
- **L-01: fixed.** Configuration, Excel and image modules have server-only boundaries; the marker alias exists only in unit-test configuration. Browser Excel fixtures use the downloadable template without importing protected server code.
- **L-02: fixed and tested.** Customer exports and pricing customer lookup filter CUSTOMER. An actual exported workbook includes the test customer and excludes staff UUID/phone.
- **L-03: hosted evidence remains.** CI checks were expanded, but no GitHub remote/deployment environment is connected. Monitoring, retention, off-site backups and production response procedures are not active merely because scripts/docs exist.

### Account and credential changes

Migration 019 separates CUSTOMER/STAFF and makes live sessions participate in SQL authorization; legacy address writes were hardened too. Customers cannot promote themselves through metadata, profile updates or staff RPCs. Owner-only provisioning, role changes and recovery enforce a server boundary; customer details have no role control. Disabled staff cannot fall back to checkout. Contact-phone changes do not add phone login to new email-only staff accounts.

The existing owner keeps local legacy access until real email verification. Its selected email was stored as pending metadata only. No password, Auth email-confirmation flag, MFA secret or real owner identity was changed. New staff must match a provider-confirmed email before privileged SQL is allowed. Old phone aliases may remain in migrated provider identities; the app refuses phone administration login after email readiness, and production SQL requires email readiness plus AAL2. No claim of removing old provider aliases is made.

Callbacks accept specific token types and fixed redirects from APP_ORIGIN. They accept no user-selected next URL and do not derive mail destinations from Host headers. Passwords/tokens are not written to audit rows or this report. Configure access-log query redaction on /auth/* before hosting.

### Executed evidence and limits

Final counts and commands are in `docs/test-report.md`. Compilation is not a runtime security pass. Local checks have exercised:

- SQL customer/admin isolation, protected columns/metadata, cross-customer orders/addresses/notifications, inactive products, best non-stacking price, tampered quotes/totals, invalid quantities, transaction rollback and session revocation.
- Real GoTrue/PostgREST concurrency: competing last stock, repeated submit/amend/collect and no duplicate money/stock/notifications; owner/manager/viewer/customer permissions.
- Browser nonce CSP with an unnonce script inserted into the initial HTTP response, distinct nonces, successful hydration, no-store headers, denied private APIs/exports and aligned checkbox text on desktop/mobile. DevTools script injection is not used as a CSP test.
- Captured Next Server Action replay from a customer is denied; an authorized control succeeds; hostile Origin is rejected before mutation. Next returned 500 with an Invalid Server Actions digest for hostile Origin. No account was created; 500 alone is not treated as proof.
- Staff cannot sign in before email confirmation. Synthetic links are consumed in the browser; the migration test reads a message delivered to local Mailpit and rejects reused confirmation. Fixtures use example.test, never a real user's inbox.
- Real TOTP verification yields AAL2. An enrolled factor forces subsequent password-only sessions to challenge. The final security suite also exercises credential-action replay and attempted removal of a verified factor without AAL2.
- npm audit returned **0 known vulnerabilities**, all severity buckets zero. This is a point-in-time registry result, not proof against unknown vulnerabilities.
- Public build scan: **70 static files**, two configured server-only values checked as literal/base64 text, **0 matches**. `scripts/check-client-secrets.mjs` never prints values. This does not prove absence of all encoded or unrelated secrets. .env.local/.work are ignored; no environment file was tracked in this uncommitted repository.
- Production preflight correctly rejected the local non-HTTPS endpoint. This is **not** a production pass; cloud checks have not executed without a hosted environment.

Inventory: 13 action modules, 5 Route Handlers, 34 page loaders, 8 server data modules, 97 historical SQL function definitions. It is a review map, not exhaustive dynamic coverage; the last migration definition is effective. Callback GET routes are token exchanges; business writes remain Server Actions/RPCs.

### Required before public launch

1. **P0 identity:** configure real SMTP/templates, confirm the owner's real inbox, enroll every active administrator on their own device and test lost-device recovery, then enforce both deployment switches. Never substitute a local test factor. Supabase's current TOTP QR generation uses the account email: see the [official implementation](https://github.com/supabase/auth/blob/master/internal/api/mfa.go) and [MFA guide](https://supabase.com/docs/guides/auth/auth-mfa/totp).
2. **P0 environment/perimeter:** separate preview/production databases and Storage, restrict network exposure and require managed TLS, configure trusted ingress and provider limits. Verify actual expiry/refresh, CORS, errors and private caching on the hosted origin. Local JWT lifetime was inspected; no one-hour wall-clock expiration test ran.
3. **P0 recovery:** schedule off-site database/file backups with retention and failure alerts; restore to isolated staging and measure RPO/RTO. A local rehearsal or GitHub checkout is not disaster recovery.
4. **P1 operations:** enable redacted monitoring/auditing, dependency alerts, resource budgets and protected deployment gates; run load/security scanning on staging only. No scanner targeted production or third-party sites.
5. **P1 scaling:** introduce file workers/concurrency control as volume grows and tune quotas from measured traffic. Dynamic public HTML for CSP correctness has a throughput cost to measure on the host.

No Critical exploit was established, but H-01/H-02/H-03 cannot close for production without the evidence above. This report does **not** certify the application fully secure or production-ready.


Delivery scheduling follow-up: migration 024 adds schedule_order_delivery with orders.write, live session/MFA checks through has_permission, a Cairo today-to-today+2 window, row locking and revision conflict detection. It writes the order/event/private customer notification/audit atomically without changing money, reservation or order state. Direct customer/viewer RPCs and direct column writes were denied in SQL tests; browser tests exercised private notifications and competing different-date edits. See the latest test-report section for the limited rerun scope.
