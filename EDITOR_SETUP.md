# Portfolio Editor

The public site remains at https://kimwonho-poet.github.io/. Its footer links to
`admin.html`, which redirects to the configured editor origin. Vercel serves the
editor and same-origin `/api/editor`; GitHub Pages continues serving the public
portfolio. Do not publish `editor-config.json` with a guessed or unverified host.

## Deployment

- Public portfolio: https://kimwonho-poet.github.io/
- Editor: https://kimwonho-editor.vercel.app/admin.html
- Vercel project: `kimwonho/kimwonho-editor`, Hobby, Node 24.
- GitHub App: `Kimwonho Portfolio Editor`, App ID `5025539`.
- Callback: `https://kimwonho-editor.vercel.app/api/editor?action=callback`.
- App installation: only `kimwonho-poet/kimwonho-poet.github.io`.
- Permissions: Contents read/write and mandatory Metadata read. No account or
  organization permissions; webhooks are disabled.
- The four values listed in `.env.example` are stored as Vercel Secret
  environment variables in **Production only**. No secret is in this repository.
- The build uses `pnpm-lock.yaml`, runs `npm run build`, and exposes only the
  allowlisted `public/` output plus the API function.

Verified on 2026-09-22: real GitHub login, original content loading, a profile
save with no semantic content changes, and logout. The save created commit
`6e5ad80`; parsed content before and after is identical, including all 33
biography entries. Anonymous content requests return 401. The editor has
no-store, noindex, and a restrictive Content Security Policy.

If recreating this setup, obtain the owner's approval before app installation
or access grants. Use a random session secret of at least 32 bytes. Never put
credentials in chat, source code, preview environment variables, or browser
storage. Changing variables requires a new Vercel production deployment.

## Security boundaries

- Only immutable GitHub user ID `301199413` can receive an editor session.
- GitHub App access must be limited to the single portfolio repository.
- OAuth state and PKCE bind login to the initiating browser. Tokens remain in
  authenticated encrypted HttpOnly/Secure/SameSite cookies, never JS storage.
- Writes require an exact same-origin header and a session-bound CSRF token.
- The repository, branch, and content path are fixed on the server.
- A stale file SHA returns 409 without retrying or overwriting other edits.
- Content is parsed as an AST without executing the site's scripts. Only data
  literals are accepted; script-breaking characters are escaped on output.
- Drafts are only in the current browser tab's sessionStorage, not in the
  public repository. Logout removes local drafts after confirmation.
- Sessions expire after at most seven hours. No refresh token is retained.
- Content is capped below GitHub's base64 content API threshold. No arbitrary
  file writes, SVG uploads, repository selection, or credentials input exist.

## Local verification

`node --test tests/*.test.mjs`

`node tests/editor-preview.mjs` starts a **local-only, fake-login, in-memory**
test server on `127.0.0.1:4319`. It cannot write to GitHub, and none of its test
posts are persisted to disk. Never deploy that server or use it as real auth.

`node scripts/build.mjs` creates an allowlisted public output. The old
`atelier-x7k2.html` is retained unchanged in GitHub for compatibility, but is
not included in the new Vercel editor output.
