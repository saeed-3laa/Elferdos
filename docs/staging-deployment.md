# Hosted testing — Netlify Free + Supabase Free

Prepared 2 November 2026. This file is setup guidance, not evidence of a completed deployment. The selected GitHub repository is https://github.com/saeed-3laa/Elferdos. No paid plan, card, automatic recharge or production database is authorized.

## Separate environment

Create a dedicated Supabase Free project for staging. Apply migrations001–030 once to the empty staging project using the supported migrations workflow. Do not reset an existing hosted database. Do not copy .env.local, local Auth accounts/passwords, local service keys, Mailpit settings or the deliberately nonfunctional local SMS provider. Do not run seed.sql on a hosted project: it is historical local-only seed data. Add synthetic staging products through the admin UI after setup.

Supabase Free may pause inactive projects and has usage/storage limits. Netlify Free has usage credits and can pause sites when exhausted; automatic recharge must stay off. Free plans are for bounded testing, not an availability/scale guarantee.

## Host settings

Connect the selected repository to Netlify. netlify.toml specifies npm run build, .next and Node24; automatic Next.js adapter detection must remain enabled. Do not configure a static export. Use the host's generated HTTPS URL initially, without purchasing a domain.

Configure these values through the dashboard, with staging-specific credentials:

- NEXT_PUBLIC_SUPABASE_URL: staging HTTPS Supabase URL, available to build and functions.
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: public staging key, available to build and functions. Never put a service/secret key here.
- SUPABASE_SERVICE_ROLE_KEY: staging privileged key, server Functions scope only.
- AUTH_RATE_LIMIT_SECRET: fresh stable random secret, at least32characters, server Functions scope only.
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

Source uploaded to GitHub main, commit56a36fa687ea545a12f71a87c76789bead65c5b4. The local checkout now tracks origin/main; the earlier initial local master commit is retained. Git transport upload timed out twice; the authenticated GitHub API upload succeeded and was verified.

Created the dedicated free project elferdos-staging (xzljxnzwgzmqeyyvgkxs) in the user-selected Elferdos organization, Frankfurt region. The provider quoted $0/month for creation. Inspected the empty public schema, then applied001and002–030 after explicit user approval of cloud test changes. Original migration versions are recorded. An additional deployment-tool record20261101233817retains the complete002–030 bootstrap payload; automatic review rejected its deletion. It remains intact, with a matching no-op tracking file in this repo so future CLI migration comparisons stay aligned. No existing local migration file/history was rewritten and this marker was not applied to the local database during deployment setup.

Read-only hosted checks after schema setup:0profiles,0orders,0products,0retired inventory role permissions. This confirms an empty staging environment, not a working app/login. No local passwords, Auth accounts, orders or product images have been copied. Host configuration, new verified owner/MFA and hosted smoke tests remain pending until the next recorded verification.

CI verification: the initial uploaded application completed all workflow checks successfully (run41362875844). The next run41363363484passed314unit/SQL tests and8basic browser tests, then69of70connected journeys; the mobile CSP/checkbox test matched two retained DOM copies. Its locator now requires exactly one visible checkbox before evaluating alignment; all CSP, nonce, response privacy and authorization assertions remain unchanged. The next workflow run must verify this correction; do not count the failed run as a pass.
