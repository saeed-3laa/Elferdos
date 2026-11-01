# Manual availability cleanup — migration 030

Local implementation completed across 31 October–1 November 2026. No cloud or production connection; no dependency update. Migrations 001–029 were preserved. The subsequent logo/slogan work is separate presentation work and does not change invoice calculations.

## Changes

- New migration 030 removes retired role-permission rows, rejects inventory.read/write even for owners, removes them from effective access, and restricts import-history reads to the existing actor/catalog-write boundary. Existing session, email and MFA checks remain intact.
- Product list uses a read-only wrapper of the existing guarded/paginated admin_products RPC with the raw available flag. Staff require catalog.read; availability editing still requires catalog.write and current revision. Read-only product details display the flag.
- Replaced current import functions with products-only implementations. Retired batches remain stored and cannot be applied. No stock-table, ledger, financial-function, or stored-price changes.
- Removed stock/settings schemas and types, stock workbook headers/parser branch, obsolete order error messages, no-op offer-fixture stock initialization, and no-op benchmark stock initialization. Workbook ZIP/formula/size protections remain tested using product templates.
- Exports label the raw flag “التوافر اليدوي”; notes and report UI explain product/category/unit activation and customer/address/quantity checks separately. Sold invoice quantities and pack contents remain meaningful and are not stock balances.
- New products/imports default to available=true. Importing an existing product preserves its flag independently of activity. Documented in the product/Excel UI and operating guides.

## Changed files for the cleanup

- supabase/migrations/202610310030_manual_availability_cleanup.sql
- src/domain/admin.ts
- src/domain/orders.ts
- src/components/admin-forms.tsx
- src/components/customer-admin-forms.tsx
- src/server/excel/workbook.ts
- src/app/admin/products/page.tsx
- src/app/admin/products/[id]/page.tsx
- src/app/admin/excel/actions.ts
- src/app/admin/excel/page.tsx
- src/app/admin/excel/export/route.ts
- src/app/admin/reports/page.tsx
- src/app/admin/reports/export/route.ts
- scripts/check-catalog-scale.mjs
- tests/unit/admin.test.ts
- tests/unit/excel.test.ts
- tests/integration/foundation.test.ts
- tests/e2e-live/admin.spec.ts
- tests/e2e-live/orders.spec.ts
- tests/e2e-live/offers.spec.ts
- README.md
- docs/admin.md
- docs/operations.md
- docs/business-rules.md
- docs/setup.md
- docs/architecture.md
- docs/implementation-plan.md
- docs/project-brief.md
- docs/security-audit.md
- docs/test-report.md
- docs/manual-availability-cleanup.md

## Executed verification

- npm test: **314 passed / 12 files**, including a later rerun after logo/PDF integration. Nine new SQL cases were added; one retired stock-schema unit test was removed. Earlier suites intentionally retain the historical 001–027 baseline. The manual-availability suite now applies 028, 029 and 030. It and upgrade preservation provide 28 current-schema cases, including availability revisions/denials/imports and unchanged historical inventory plus movements during ordering, amendment, cancellation, delivery and returns.
- npm run lint: passed, including after the benchmark cleanup.
- npm run typecheck: passed, including after browser-test updates and branding source changes.
- npm run build: passed for the availability UI; the later final branding build also passed; see test-report.md.
- node --check scripts/check-catalog-scale.mjs: passed. The benchmark itself was not rerun.
- npx supabase migration up --local: applied only 202610310030 successfully, without reset.
- Read-only local PostgreSQL checks: migration 030 registered; zero retired role-permission rows; authenticated inventory SELECT, movement INSERT and legacy set_inventory_by_unit EXECUTE all false.
- Connected production-build browser subset: initial **17 passed / 3 failed / 20**. Two failures expected the word “أهلية” although the actual workbook explanation used “قبول الطلب يتطلب”. A mobile audit assertion assumed an insertion remained on the newest page while concurrent export fixtures generated hundreds of logs. The tests now inspect the actual explanatory phrase and the event's cursor page; no application authorization was relaxed.
- Corrected connected run: **22/22 passed**, desktop and Pixel 7 emulation, including the modified offers fixture. Covers staff/viewer availability visibility, customer isolation, product availability save/reload, product import, concurrent/idempotent orders, competing amendments, collection, cancellation race, partial/full returns, invoice/PDF and streamed multi-page customer/product exports.

The exact connected command was:

```powershell
$env:E2E_PRODUCTION='1'
npm run test:e2e:local -- --grep 'receives only their authorized admin screens|owner manages catalogue|admin manages public and customer pricing|complete customer and product spreadsheets|accepts concurrent orders|customer return approval|serializes competing amendments|customer cancellation|shows genuine offers'
```

The initial sandboxed runner's server teardown stalled; only its own PID 23664 was terminated. The corrected run allowed its runner to stop its temporary server and exited successfully. No normal preview or Supabase service was stopped by that cleanup.

## Legacy references deliberately retained

- Migrations 001–029 and historical SQL test cases document/test the original schema. They were not rewritten. Deprecated RPC definitions remain inaccessible; the retired tables and records remain intact.
- Migration 030 names the retired permissions only to remove/deny/filter them. INVENTORY_RETIRED remains an explicit compatibility rejection. Original stock import snapshots remain historical records.
- Old audit snapshots and their display compatibility remain historical; they do not expose an inventory editor or stock mutation path.
- No-stock regression assertions and synthetic-fixture cleanup refer to inventory tables to detect accidental reintroduction. scripts/test-local-auth.mjs also checks that public catalog responses disclose no inventory fields.
- sales_report.low_stock remains an empty compatibility array; no current low-stock report is displayed.
- Architecture, competitor analysis, implementation plan, original brief, past audit/test entries and old setup baseline preserve historical context with supersession notices. operations.md, admin.md and business-rules.md describe the current rules. “security surface inventory” means a code-surface listing, not warehouse stock.

## Remaining limits

The full 70-test connected suite was not rerun in this cleanup. The 22-test run is a targeted result, not a complete security certification. minimatch remediation, real-owner verification/MFA rollout, remote scheduled backups/restoration and hosted staging checks remain open. No production readiness claim.

## Separate approved branding follow-up

After cleanup verification the owner asked where the previously approved logo/slogan were. The original transparent PNG was copied without editing and “جملة تسند شغلك” applied in site/admin branding, HTML print invoice and generated PDF. No financial expression or SQL was changed for branding.

Additional files: public/branding/ferdous-logo.png; src/components/brand.tsx; src/components/invoice.tsx; src/server/pdf/invoice-pdf.ts; src/app/design-system.css; next.config.ts (local PDF asset tracing); tests/e2e/foundation.spec.ts; tests/unit/invoice-pdf.test.ts; docs/branding.md. The existing live order test additionally verifies the invoice logo/slogan.

Final brand results:314 unit/SQL tests, lint, typecheck and production build passed. Basic UI rerun8/8 passed after correcting the header/footer locator and waiting for a development navigation; its first run was5/8. A further4/4 connected staff/return/invoice/PDF journeys passed on desktop and Android. These do not mean the complete70-test suite ran after branding. Both short and long synthetic PDFs were rendered and visually reviewed. Current preview:http://127.0.0.1:3400/.
