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
- Drafts are per-account, per-document records in localStorage on this device,
  not the public repository. Logout leaves drafts for the same owner to resume.
  Revisions detect competing tab writes. Each draft retains its original content;
  publishing compares it with the latest remote version before merging the edited
  document into the latest list. Unrelated posts are never replaced by a stale list.
- The login screen offers a 30-day persistent session. Its encrypted HttpOnly cookie
  holds the expiring GitHub access and refresh tokens. Access tokens rotate before
  expiry without extending the original 30-day session. Temporary login omits
  Max-Age. Logout clears the cookie. Cookie deletion, app revocation, private browsing,
  or the 30-day deadline requires another login. Persistence applies to the same
  browser profile, not automatically to other browsers on the same Mac.
- Content is capped below GitHub's base64 content API threshold. No arbitrary
  file writes, SVG uploads, repository selection, or credentials input exist.

## Writing experience

Tiptap/ProseMirror provides Korean composition, formatting, lists, quotes, links,
undo/redo, and image insertion. The sticky toolbar and title-first canvas keep
publication metadata in a separate dialog. Previews and public reading use the
same allowlisted JSON renderer, with plain-text fallback for legacy posts. Stored
HTML is never inserted. Photos are resized locally to bounded JPEG data URLs and
stay private in drafts until publication; SVG is not accepted. Individual rich
documents are capped at 600 KB and the whole portfolio remains below 950 KB.
Use external HTTPS image URLs for many large photographs. The site is not intended
to store original image files. Profile photos can also be chosen from the device.

Run `node scripts/icons.mjs` then `node scripts/build.mjs` before publishing. Commit
the generated `composer.bundle.js` and `rich-render.js` because GitHub Pages serves
the repository directly. Vercel rebuilds those assets independently. The editor
uses same-origin scripts only; inline styles are restricted to style attributes
required by rich-text alignment, and inline scripts remain blocked.

## Local verification

`node --test tests/*.test.mjs`

`node tests/editor-preview.mjs` starts a **local-only, fake-login, in-memory**
test server on `127.0.0.1:4319`. It cannot write to GitHub, and none of its test
posts are persisted to disk. Never deploy that server or use it as real auth.

`node scripts/build.mjs` creates an allowlisted public output. The old
`atelier-x7k2.html` is retained unchanged in GitHub for compatibility, but is
not included in the new Vercel editor output.
