# Hosted testing — Netlify Free + Supabase Free

Prepared 2 November 2026. Setup guidance and observed staging results are separated below. The selected GitHub repository is https://github.com/saeed-3laa/Elferdos. No paid plan, card, automatic recharge or production database is authorized.

## Separate environment

Create a dedicated Supabase Free project for staging. Apply migrations001–030 once to the empty staging project using the supported migrations workflow. Do not reset an existing hosted database. Do not copy .env.local, local Auth accounts/passwords, local service keys, Mailpit settings or the deliberately nonfunctional local SMS provider. Do not run seed.sql on a hosted project: it is historical local-only seed data. Add synthetic staging products through the admin UI after setup.

Supabase Free may pause inactive projects and has usage/storage limits. Netlify Free has usage credits and can pause sites when exhausted; automatic recharge must stay off. Free plans are for bounded testing, not an availability/scale guarantee.

## Host settings

Connect the selected repository to Netlify. netlify.toml specifies npm run build, .next and Node24; the explicit @netlify/plugin-nextjs runtime in netlify.toml must remain enabled. Do not configure a static export. Use the host's generated HTTPS URL initially, without purchasing a domain.

Configure these values through the dashboard, with staging-specific credentials:

- NEXT_PUBLIC_SUPABASE_URL: staging HTTPS Supabase URL, available to build and functions.
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: public staging key, available to build and functions. Never put a service/secret key here.
- SUPABASE_SERVICE_ROLE_KEY: staging privileged key, marked secret. On Free the explicitly approved scopes are Builds, Functions and Runtime; use Functions-only where the plan permits.
- AUTH_RATE_LIMIT_SECRET: fresh stable random secret, at least32characters, marked secret with the same approved Free-plan scopes.
- APP_ORIGIN: fixed HTTPS staging-site origin for build and functions. Update Supabase Site URL and allowed /auth/confirm redirect to that origin. Do not derive it from visitor headers.
- TRUSTED_CLIENT_IP_HEADER: leave unset until the proxy's overwrite guarantees are verified.

Keep secrets out of netlify.toml, GitHub source, build logs and chat. Untrusted fork deploy previews must not receive privileged credentials. Do not attach staging secrets to a future real-production project.

## Accounts and initial access

Create a fresh owner with a different strong password for hosting. Verify the real email through the configured Auth email flow, enroll TOTP, retain recovery codes and only then enable mandatory staff email/MFA policy. Never enable policy before the owner is ready. Local email_confirm flags did not prove ownership of the real mailbox.

Enable hosted phone/password Auth for customer testing. SMS-provider configuration is needed if phone confirmation is enabled; do not copy the local dummy provider. Confirm the intended phone-account provisioning and confirmation flow on staging before inviting testers. Configure real SMTP for dependable staff invitations/recovery; provider default mail is rate-limited.

## CI/CD

.github/workflows/checks.yml runs lint, typecheck, unit/SQL tests, audit(high threshold), build, basic browser tests, and live browser tests on an isolated local Supabase stack in GitHub Actions. It must not point test fixtures at hosted staging. The moderate minimatch advisory remains open and is not blocked by the existing high-severity audit threshold.

Netlify's Git integration can build/deploy pushes automatically. That alone does not mean deployment waits for GitHub checks. Before enabling gated continuous delivery, use required checks and a reviewed deploy trigger; keep cloud credentials out of pull-request workflows. Database migrations are a separate controlled step and must precede code that requires them. Do not run db reset from deployment.

## Required hosted smoke tests

Check homepage/logo, staff verified-email/TOTP sign-in, customer phone login, account isolation, cookie/no-store/CSP behavior, manual availability/revision conflicts, pricing and order submission, amendment/cancellation, delivery/payment, returns/refunds, notifications, image upload, product/customer XLSX exports and PDF/print. Verify the PDF logo/font tracing, streamed export size/time limits, Auth callback URLs and server-only credential separation on the actual provider. Record failures; do not mark success from a build alone.

Public launch still requires dependency-risk resolution, monitoring and backup/storage restore evidence. This testing setup does not claim production readiness.

Sources: https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/ ; https://www.netlify.com/blog/introducing-netlify-free-plan/ ; https://supabase.com/pricing ; https://supabase.com/docs/guides/auth/passwords

## Actual progress — 2 November 2026

Repository: https://github.com/saeed-3laa/Elferdos, branch main. Initial authenticated Git upload succeeded after two transport timeouts; subsequent normal Git pushes work. Netlify is connected to the existing GitHub installation177650137. A normal push of74315b7e9faa3e577b46a8cccbd62eeb06c5a5cb automatically produced a ready deploy, proving automatic Git integration. Deployment currently runs independently of GitHub checks, not after a required-check gate.

Supabase Free project elferdos-staging (xzljxnzwgzmqeyyvgkxs), Frankfurt, was created in the selected Elferdos organization at a quoted $0/month. Migrations001–030 were applied to the empty cloud test database after explicit approval. An extra SDK migration record20261101233817retains the full002–030 bootstrap payload; deletion was rejected by automatic review. The record and matching no-op tracking file remain, preserving history. No original migrations were rewritten; no local accounts, passwords, orders or catalog data were copied.

CI evidence: run41364537512 passed314unit/SQL tests,8basic browser tests and70connected journeys on an isolated local Supabase stack. Run41367295386 subsequently failed1of70journeys because an Android Excel locator matched retained hidden DOM. After narrowing it to the visible file input, full run41368253377 passed314tests in12files,8basic browser tests and70connected journeys, plus lint, typecheck, dependency high-severity threshold and build. Earlier run41363363484 had a similar checkbox-locator failure, subsequently corrected. Failures remain failures; isolated CI results do not establish hosted authorization.

Netlify Free site: https://elferdos-staging.netlify.app. Initial ready builds had no Next.js Functions and returned404 after the site's default Netlify SSO gate was disabled with explicit user approval. The runtime is now explicitly configured via @netlify/plugin-nextjs. Deploy6ae7db9030474e6c1c7f1973, commit b0670781cb27d2712e2bc0fa61ea726db3871202, reports plugin success and a Next.js Server Handler on Node24. Read-only hosted smoke run41367295379 attempt3returned200 for the homepage, staff login and logo; CSP nonce and no-store assertions passed. It failed private search:200instead of403. Investigation verified that no project environment variables had actually been persisted by the earlier env:set commands. Thus the published app was using its unconfigured fallback; this was not a passing backend integration test.

The official API successfully persisted the3public configuration values and read-back comparisons matched the ignored local staging file. Free rejected granular per-feature scopes. After separate explicit user approval, the2server values were saved with is_secret=true and scopes Builds, Functions and Runtime, production context only (Netlify's label for this test site). They are not in GitHub, browser source, or fork-preview contexts. This is broader build-time access than the originally proposed Functions-only scope; do not claim Functions-only isolation on Free. A fresh deployment and hosted HTTP verification are still pending after this settings change. No paid plan or automatic recharge was enabled.

Auth config was pulled into an isolated ignored workdir. Custom confirmation/email-change templates were rejected400by the Free default-email provider. A URL-only retry succeeded and a config diff verified zero declared updates remaining; email confirmations,8-character email OTPs and enabled TOTP were preserved. The allowlist contains the hosted /staff/login and /auth/confirm URLs. The initial default-provider confirmation returns to /staff/login, because Supabase verifies its default link before redirecting; the app's /auth/confirm handler expects a custom token_hash template. Additional staff invitations, email change and resend flows still need compatible SMTP/templates and hosted verification.

A fresh staging-only unconfirmed Auth account, STAFF profile and OWNER assignment were created after authorization, with a random password in ignored local access files only. A single signup-confirmation request was accepted, and a later read-only Auth query verified the real owner's email confirmation. A direct staging Auth password login and get_staff_access returned OWNER and email_ready=true, then the test session was signed out. This verifies Auth/database access for that account, not the browser login flow. The real owner has no verified TOTP factor yet; mandatory global email/MFA switches remain unchanged until enrollment is ready. Local account credentials are unchanged.

Local HTTPS and in-app browser attempts timed out; remote GitHub smoke reached Netlify. Phone Auth was initially disabled and no real SMS provider is configured. Customer self-registration/login, additional staff mail flows, authenticated hosted isolation, products/images/imports/exports/PDF, orders/amendments/cancellation/delivery/payments/returns and notifications remain unverified on the actual host. The moderate minimatch advisory, scheduled offsite backups/storage restores and monitoring remain launch blockers. No production-readiness claim is made.
