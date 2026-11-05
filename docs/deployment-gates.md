# CI/CD and production readiness gates

Status: repository implementation tested locally; **hosted activation is partial and end-to-end enforcement is not proven**. See the dated activation records below. The deployment-gate changes are prepared on `codex/deployment-security-gates` for review only: merging and staging deployment require separate owner approval. No site was deployed and no Supabase record, user, MFA or phone setting was changed. No package was installed and no plan was purchased. This document supersedes the old build-only deployment guidance for the next reviewed release.

## GitHub protection verification — 2026-11-05

Read the saved state before making any hosted change. No protection modification was needed.

- [Main branch API](https://api.github.com/repos/saeed-3laa/Elferdos/branches/main): `protected=true`, enforcement `everyone`, required context `verify`, GitHub Actions App ID `15368`. Main remains `010929662d5328d49cf6ba6eaba472b542c3974b`.
- [Active main ruleset 26568778](https://github.com/saeed-3laa/Elferdos/rules/26568778), also read through its REST detail endpoint: enforcement `active`, include `refs/heads/main`, exclude `[]`; rules `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`; strict/up-to-date checks `true`, context `verify`, integration ID `15368`. Required approving review count `0`; code-owner review `false`; allowed merge methods `merge`, `squash`, `rebase`. API reports `current_user_can_bypass=never` for the connector; it does not establish the owner's permissions by itself.
- [Saved classic protection 85826464](https://github.com/saeed-3laa/Elferdos/settings/branch_protection_rules/85826464), read in the authenticated owner Dashboard: PR required **on**, status checks required **on**, up-to-date required **on**, `verify` accepts **GitHub Actions**, administrator bypass forbidden **on**, allow force pushes **off**, allow deletions **off**, lock branch **off**, required approvals **off**, code-owner review **off**. The classic protection and ruleset are overlapping controls; neither was deleted or weakened.
- Owner-session [Manage access](https://github.com/saeed-3laa/Elferdos/settings/access) states **0 collaborators** and **Only you can contribute to this repository**. Owner can still access administration. Only main is targeted; feature-branch creation remains allowed. PR approval is not required, so the owner can merge their own PR after required checks pass; GitHub self-approval remains unavailable. No merge was performed to test that permission. The proposed CODEOWNERS file names the sole owner and does not introduce mandatory approval.
- Deploy Previews remain disabled by the owner's latest direction. No Netlify setting was changed during this follow-up. No direct push to main, staging trigger, production setup or production publication is authorized by this PR preparation.

The working tree was inspected with `git status --short` and `git ls-files --others --exclude-standard`. Only the twelve deployment files listed below are included. Existing changes to `AGENTS.md`, `docs/security-audit.md`, `docs/test-report.md`, `next-env.d.ts`, `.agents/`, `skills-lock.json`, staging password-policy documents/script/test and frontend accessibility tests/fixtures/helpers are excluded and preserved.

Known local full-lint failure remains disclosed: the previous `npm run lint` failed with 24 errors under untracked `.agents/skills/security-audit/` (CommonJS require rules and an unused catch variable). Those files are not part of this PR; no lint configuration, exclusions or suppressions were added. Historical test results below are not a claim that the new hosted PR CI has passed. In this follow-up source/diff inspection was performed; application builds, connected tests and production readiness RPCs were not run.

## Hosted activation record — 2026-11-04 (historical; GitHub pending state superseded above)

The owner explicitly authorized limited activation on GitHub main and the existing staging site only. These observations come from authenticated Dashboard UI, not TOML assumptions. Site ID: `876ef6e7-5d8c-4e64-a651-24aa3e4f7468`.

- **Changed:** `FERDOUS_DEPLOYMENT_TIER` was absent; created as `staging` only in Netlify's main-branch **Production context**. Deploy Previews, branch deploys, Preview Server/Agent Runners and local-development values remain empty. The saved value and context rows were re-read. The context name does not make this a business production site.
- **Changed:** Enforce deployment methods previously stated **All deployment methods can deploy to production**. Enabled **Only Git-based production branches can deploy to the production context**. Saved UI now states CLI/MCP/API cannot deploy to that context, but explicitly says those methods remain available for preview/branch contexts. This is configuration evidence, not an attempted forbidden deployment.
- **Changed:** Deploy Previews previously applied to any PR against the production/branch-deploy branches. Saved **Don't deploy pull requests**. This stops new automatic PR builds; existing deployments were not deleted. The owner subsequently requested a pause and prefers safely isolated Git previews. No further preview change was made. Preview policy is pending agreement; do not treat disabling it as the final accepted design.
- **Preserved and verified:** native repository connection `saeed-3laa/Elferdos`, active builds, `main`, `npm run build`, `.next`, Node 24.x and branch deploys disabled.
- **Verified without changes:** `APP_ORIGIN=https://elferdos-staging.duckdns.org` and `NEXT_PUBLIC_SUPABASE_URL=https://xzljxnzwgzmqeyyvgkxs.supabase.co` in the main context. Project overview links the same primary domain. Worker-resolved `URL` has not been checked in a fresh build.
- **Verified without revealing values:** `SUPABASE_SERVICE_ROLE_KEY` and `AUTH_RATE_LIMIT_SECRET` are marked secret, scoped to Builds/Functions/Runtime, and have a value only in the main Production context. Dashboard rows for Deploy Previews, branch deploys, Preview Server/Agent Runners and local development are empty. No production credential was added or copied. Masked credentials cannot independently prove which backend issued them.
- **Plan limitation observed:** the variable form disables Specific scopes and offers **Upgrade to unlock**. Context-specific values are available. The new non-secret tier therefore uses All scopes with only the trusted-main context populated. No upgrade was attempted.
- **Verified without changes:** sensitive-variable policy is **Require approval** for unrecognized fork authors. This alone does not isolate every PR or prevent privileged manual publication. No build hooks were listed; only **Add build hook** was present.
- **GitHub pending:** main was unprotected. Prepared a classic main protection with PR required, approvals not required to avoid a sole-owner self-review lockout, required/up-to-date `verify` from **GitHub Actions**, administrator enforcement, force pushes/deletions disabled. Create redirected to **Confirm access**; persistence is not confirmed. Owner identity confirmation is required before claiming this protection active. Collaborator inspection also requested confirmation, so independent CODEOWNER reviewer availability remains unknown; required CODEOWNER review was not enabled.

Remaining risks: the current Netlify control does not enforce Git-only preview/branch publication. No equivalent broader control has been established on this plan; do not claim it impossible on all plans or blocked locally. No dedicated preview backend was created. Local deployment gates remain unpushed, so the live Git path is not yet proven to wait for CI. Dashboard re-publish/rollback permissions, team/token permissions, shared/team variable inheritance and negative publishing tests remain unverified. Public build logs were observed; existing logs were not scanned for secrets. No production site or deployment was created, and no deployment or database record was deleted. Application tests were not re-run for this Dashboard/documentation-only activation; earlier local test results below are historical evidence only.

## Previous and currently observable state

- `netlify.toml` previously invoked `npm run build` and the Next.js runtime only. `check-production-security.mjs` existed outside that path. A successful Next build was not evidence of successful CI or production identity readiness.
- Read-only GitHub inspection of `saeed-3laa/Elferdos` returned `main.protected=false`, required-status enforcement off/empty, and an empty repository ruleset list. The branch-protection detail endpoint returned 403 because the connected integration has no administration permission. No remote protection was changed.
- GitHub run `41374940872` passed the `verify` job for the existing main commit `010929662d5328d49cf6ba6eaba472b542c3974b`. This is evidence about that old commit only, not these unpushed changes. The live job response contains the SHA and run-attempt fields used by the new gate.
- `docs/staging-deployment.md` records native Netlify Git Auto Deploy on the existing staging site, whose primary URL is `https://elferdos-staging.duckdns.org` (also `https://elferdos-staging.netlify.app`). This remains a staging site despite Netlify naming its main-branch context `production`. No separate production site or approved production origin was identified in source.
- The in-app browser reached Netlify's login screen. Current site settings, deploy actors, Git integration configuration, resolved adapter, hooks and secret contexts could not be inspected. There is no evidence that Netlify currently waits for CI. The implementation below adds its own wait after activation rather than assuming a provider setting.

## Repository changes

- `.github/workflows/checks.yml`: add the deployment-gate tests to the existing verify job, cancel obsolete runs for the same ref, and support merge-group checks. Retain existing lint/types/unit/audit/build/basic and connected browser checks.
- `.github/CODEOWNERS`: identify the repository owner for workflow, deployment-policy, test and package changes. This needs an externally enforced required-review rule to have protective effect.
- `netlify.toml`: retain native Git builds and the existing Next.js runtime. Install the local gate plugin last, and blank known backend/privileged variables in the deploy-preview context as defense in depth.
- `netlify/plugins/deployment-gates/{index.js,manifest.yml,package.json}`: a dependency-free local Netlify Build Plugin with `onPreBuild` and `onPostBuild` hooks.
- `scripts/deployment-gates.mjs`: exact-commit CI, target/site/backend checks and sanitized fail-closed plugin handlers.
- `scripts/check-production-security.mjs`: retain a standalone CLI and expose the same read-only readiness function for the plugin/tests. Imports have no network side effect. Validate origins/config before an RPC; reject missing, malformed or unreachable readiness data and sanitize errors.
- `tests/deployment/{gates.test.mjs,run-plugin-fixture.mjs}` and `package.json`: add `npm run test:deployment-gates`, using the existing Node runtime and built-in test runner. No new dependency or lockfile change.

## New native Auto Deploy path

1. A push to main still starts GitHub CI and Netlify through their native integrations. No deploy hook/token or new privileged GitHub deploy workflow is introduced.
2. The Netlify pre-build plugin validates the explicit site tier, known site/backend, branch, context and 40-character COMMIT_REF. Only the main-branch site context is enabled. Missing configuration blocks rather than silently treating a production site as staging.
3. The plugin waits for `.github/workflows/checks.yml`, event **push**, branch **main**, repository **saeed-3laa/Elferdos**, and that **exact SHA**. Only the latest matching successful run is accepted. Its `verify` job must also be completed/successful for the same SHA and run attempt. Success from a PR, other repository/workflow, older SHA, skipped job or stale successful run is insufficient.
4. If CI fails, is cancelled/skipped, cannot be read, returns malformed data or never appears before the bounded deadline, the plugin calls `utils.build.failBuild`. No application build is permitted through that hook.
5. On a **production-tier site only**, the existing production checker must additionally verify global mandatory MFA, mandatory staff email, at least one active staff account and zero staff awaiting verified email/TOTP. It performs only `deployment_security_status`; it never enables a policy or edits an account.
6. After a successful app build and framework packaging, `onPostBuild` rechecks CI without waiting and rechecks production readiness when applicable, before the deploy stage. A new CI failure, changed main SHA, lost connectivity or readiness downgrade blocks publication. The plugin remains independent of the configured app build command.

`npm run build` stays `next build`. GitHub's verify job does **not** invoke Netlify or production readiness and does not require production credentials. Netlify waits for GitHub, while GitHub does not wait for Netlify: no circular dependency. Do not make a Netlify deploy status a prerequisite of the very CI job the Netlify gate waits on.

The wait is at most 25 minutes, polling every 45 seconds with 10-second HTTP request bounds. Actual host build-time/credit limits may stop it sooner; that fails closed. The repository is public, so the API can work without a token. Unauthenticated limits can still block a build; an optional dedicated read-only Actions token may be scoped to trusted main builds only if needed. It must never be available to PR/preview code or logs. HTTP errors/redirects are rejected, not bypassed.

## External activation checklist — remaining items require verification

These are external authorization/configuration tasks. They require the owner's explicit permission and an authenticated Dashboard session. Repository code cannot set them reliably or prove they already hold.

### GitHub main protection

- Configure a main ruleset/branch protection: require PRs and the `verify` status from GitHub Actions, require up-to-date checks (or use the tested merge queue), disallow force pushes/deletion and disallow bypass where available.
- Enable required code-owner review for deployment/workflow changes; arrange an authorized reviewer other than the PR author if reviews are required. A CODEOWNERS file alone does not enforce review.
- Review administrators, Apps and tokens that can change workflows, push protected main, bypass rules or publish to Netlify. Do not add Netlify publication as a dependency of verify.
- Do not allow `[skip ci]` to become a successful gate: a missing/skipped run is rejected by the plugin. Required checks should also block merging skipped work.

### Existing staging Netlify site

- Keep the existing repository/main Git connection and Auto Deploy.
- Set `FERDOUS_DEPLOYMENT_TIER=staging` on **that staging site** for trusted main builds only. The new gate intentionally blocks builds while this value is absent. This does not alter or require production MFA switches.
- Confirm `URL` is the known staging primary origin, `APP_ORIGIN` matches it, and the backend is the existing staging Supabase project. The code rejects a production database in this staging path.
- Keep the local gate plugin enabled and last after framework packaging. Verify Dashboard plugins/build overrides cannot remove it. The app build command remains `npm run build`.
- Do not install production credentials into this site. Restrict any optional GitHub read token to build scope and trusted main context only.

### Production promotion

- Use a separate production site with its own isolated database and secrets; no production site is created by this task.
- A future authorized setup must set `FERDOUS_DEPLOYMENT_TIER=production`, an explicit `FERDOUS_PRODUCTION_ORIGIN`, matching primary `URL`/`APP_ORIGIN` and the production backend/required credentials. It must not use the staging database or stage origin. No approved real production origin is invented here.
- Restrict production publishing/promotion to the authorized protected path. Existing-deploy **Publish**, rollbacks/restores, drag-and-drop uploads, API/CLI `deploy --prod` without a build and privileged alternate hooks may bypass Build Plugins. Disable/restrict those permissions and require protected promotion; the Free plan's available controls must be checked without buying a plan.
- The source-selected production path checks readiness twice, but it cannot intercept a Dashboard re-publish of an already built artifact. If the account/plan cannot enforce the required publishing restrictions, keep production publishing closed and design an exclusively controlled promotion path before launch. Do not claim the bypass is solved by this plugin alone.
- Do not enable MFA or change the real owner in order to make this task pass. Missing readiness should leave production blocked while staging remains usable.

### Deploy Previews and secrets

- Preview/branch/preview-server contexts currently fail closed in the gate; no preview is published by the implemented policy. Blank preview values in TOML are additional defense, not proof of host secret isolation.
- Keep untrusted previews disabled at the production site. Remove production variables from **all-context**, shared/team, deploy-preview, branch-deploy and fork-build scopes; use production-only contexts/scopes. Do not expose a production service-role key or rate-limit secret to PR dependency installation, builds, functions or logs.
- A PR can modify `netlify.toml`, package installation hooks or the plugin before a Build Plugin executes. A plugin detecting secrets or failing later cannot undo an earlier leak. Only external context/permission isolation can establish that untrusted code never receives secrets.
- If previews are later required, use a separately isolated preview site/backend with no production credentials and a reviewed preview-specific CI policy. This task deliberately provides no flag that skips the main/production gates to enable previews.

## Tests actually run

`npm run test:deployment-gates`: **35 passed, 0 failed**, no skipped tests. The fixture launches the actual exported plugin hooks in a child process with a scrubbed environment and dummy origins/credentials. Every fetch is replaced in memory; no GitHub, Netlify or Supabase request can fall through to a real service. Dummy build/publication counters prove the protected callback is not reached on failures. This is a tested plugin lifecycle model, not an actual Netlify deployment.

- Scenario 1: successful exact-commit CI permits staging build and simulated publication.
- Scenario 2: failed CI permits neither; CI failure after building blocks publication too. Missing/queued/failed/cancelled/skipped/timed-out runs, wrong SHA/branch/repository/workflow/event, failed/skipped verify job, mismatched attempt and outdated main are rejected.
- Scenario 3: successful readiness permits simulated production publication; the real Supabase client is exercised against an in-memory RPC response.
- Scenario 4: mandatory MFA off, email requirement off, no active staff, pending staff, RPC error/network failure and malformed response each block production. A post-build downgrade also blocks publication. Error/secret markers do not enter logs.
- Scenario 5: staging never calls the production readiness function and needs no production credentials or mandatory-MFA rollout.
- Scenario 6: preview config blanks known variables; actual plugin preview hooks reject before any app build or readiness call even when dummy production secrets are injected. **This does not prove real Netlify secret scoping**, which remains a manual activation prerequisite.
- Scenario 7: the final hook rejects an unverified deploy even without a pre-build call, and misclassified sites, wrong branches/contexts and missing commit/tier fail closed. **Dashboard/API/manual publication bypasses remain unverified and cannot be excluded by repository code.**

Other checks:

- `npm test`: **318 passed in 13 files**. PGlite creates isolated in-memory SQL/Auth fixtures; connected hosted tests were not run.
- `npm run typecheck`: passed.
- ESLint on all five changed/new JS test/script/plugin files: passed with zero warnings.
- `npm run lint`: **failed, 24 existing errors in untracked `.agents/skills/security-audit/*.cjs`** (CommonJS require rules/one unused catch variable). Those skill files predate this task and were not edited or excluded to hide the failure. This is not a green full CI result.
- `git diff --check`: passed.
- A direct read-only invocation of the CI lookup against the existing public main SHA was attempted. The local execution network rejected it with **EACCES**; the gate blocked as designed. Separately, the connected GitHub read API returned the actual main workflow/job metadata. Neither result verifies execution from a Netlify worker.

No live Netlify staging deployment, production promotion, new GitHub CI run, browser ordering flow, Dashboard secret-scope check or protected-branch negative push was performed. No production RPC was called. No build artifact was published. The overall task remains **pending hosted activation and end-to-end evidence**, despite passing local failure-path tests.

## Hosted acceptance evidence still needed

After explicit authorization and external activation, use staging-only controlled commits to demonstrate a successful CI leads to a ready deploy of the same SHA, and a failed/missing CI cannot publish (record run/deploy IDs). Use a separate disposable production-policy fixture or protected non-public promotion rehearsal to demonstrate readiness refusal without touching real owner/MFA settings. Review preview scopes before any untrusted preview executes. Record attempted forbidden publishing paths with owner-observed permission evidence; do not test production publication during this task.

References: [Netlify Build Plugin lifecycle/failBuild](https://docs.netlify.com/extend/develop-and-share/develop-build-plugins/), [Netlify deploy contexts](https://docs.netlify.com/deploy/deploy-overview/), [Netlify environment context/scopes](https://docs.netlify.com/build/environment-variables/overview/), [GitHub workflow runs](https://docs.github.com/en/rest/actions/workflow-runs). Installed Next.js deployment/platform and production-checklist guides were read before implementation. Existing business/order/availability logic is unchanged.
