# Sunny SAI security and operations

## Responsible disclosure

Report security issues to the repository owner through a private GitHub channel. **Do not post API keys, vulnerabilities, location histories, or exploit details in public issues.** If no private reporting channel is available, contact the maintainer privately before publishing details.

## Production and preview access

- Treat **`main`** as a protected production branch. Require pull requests, passing CI checks, and (where team members are available) independent reviews. Restrict force pushes and deletion. Configure this under **Settings → Rules → Rulesets**; committing this document does not enable the protection.
- Consider making the repository **Private** under **Settings → General → Danger Zone → Change repository visibility**. Before changing visibility, verify Vercel's GitHub App still has access to the repository and that collaborators retain the intended permissions.
- Keep Production and Preview deployments separately managed, with exact environment-specific `APP_ORIGIN` values. Check both custom/assigned domains after a change.
- Protect GitHub and Vercel logins with two-factor authentication and grant least-privilege repository/project access. Avoid sharing owner tokens.

## Credential handling

- Never commit real `.env` files, API tokens, cookies, credentials, or location logs. The checked-in `.env.example` is placeholders only.
- Server-side keys: `SESSION_SECRET`, `KAKAO_REST_API_KEY`, `KMA_API_KEY`, `SAFEMAP_API_KEY`, and deployment tokens. Store only in Vercel sensitive/encrypted environment variables or the relevant platform secret store.
- The Kakao JavaScript map key must be delivered to the browser to initialize the Kakao Maps SDK, so it is **not a secret**. Restrict its authorized domains in Kakao Developers. Restrict provider API products, quotas, and permitted origins/IPs wherever supported.
- The VWorld browser map key, when used, is similarly browser-visible and needs provider-side origin restrictions. Remove unused key and map integrations when no longer needed.
- If a credential may have appeared in a commit, log, issue, screenshot, or public chat, **rotate it at the issuing service and update both Vercel environments**. Merely deleting a file or changing the repository to private does not revoke a leaked credential.
- Never echo sensitive environment variable values in logs, diagnostic endpoints, or client-side error messages. Verify only key names and target environments in configuration reviews.

## Application and privacy

- Keep server-side proxy endpoints for paid/rate-limited provider calls, validate inputs, enforce per-client usage budgets, and apply shared rate limiting across serverless instances before substantial public traffic.
- Keep CSRF checks, short-lived authenticated session cookies, input limits, explicit request-origin checks, upstream timeouts, and strict provider response validation.
- The app stores recent destinations and favorites (including coordinates) in browser localStorage. This is **personal navigation history**, even when it stays on the device. Disclose storage, offer clear deletion controls, and avoid storing GPS traces or API credentials there.
- Do not assume a green data-source connectivity check means a flood, ice, fog, or precipitation warning is accurate at a particular route/time.
- Before adding a Content Security Policy or frame restriction, enumerate and test Kakao Maps, map tiles, official weather imagery, and audio providers in both Preview and Production. Strict policies can unintentionally disable navigation functionality.

## Release checklist

1. Inspect changed files and dependency advisories; investigate GitHub secret-scanning findings and Dependabot alerts, if enabled for the repository.
2. Run `pnpm check`, `pnpm test`, and `pnpm build:vercel` in CI, with no real secrets exposed to pull requests.
3. Test Kakao Maps bootstrap, GPS permissions, destination search, route request, weather overlays, voice, and preview/production API connectivity.
4. Confirm the production domain, `APP_ORIGIN`, provider domain allowlists, Vercel Git repository association, and the production commit before deploying.
5. Revoke temporary credentials and check service quotas / abnormal request counts after launch.
