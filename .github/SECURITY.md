# Security policy

## Reporting a vulnerability

**Do not open a public issue.** Use a private report:
**[Report a vulnerability](https://github.com/iSweat-exe/yet-another-reader/security/advisories/new)**
(Security tab > Advisories > "Report a vulnerability").

Include what you found, how to reproduce it, and the version of the app. You get an answer within a week, and the
fix is published with credit to you if you wish.

## What counts

- The local API (`127.0.0.1`) answering something it should not, or being reachable from another machine or from a
  web page through DNS rebinding.
- A way to make the app write to the game process, run code in it, or simulate input. The app is **read-only by
  design**: any path to writing is a vulnerability.
- Community widgets reaching more than the API they are given.
- The update system: installing an update that is not signed by the project's key, or a way to leak or abuse that key.
- Secrets or personal data written to logs or files.

## How the local API is protected

- It binds to `127.0.0.1` only and exposes read-only data.
- It answers only requests whose `Host` header names the local machine (`127.0.0.1`, `localhost`, `[::1]`). A
  request addressed to any other name, which is what a DNS rebinding attack produces, gets `403 forbiddenHost`.
- CORS is open on purpose: overlays are web pages (OBS browser sources, local files) that must be able to read it.
  The data is the game state (score, combo, beatmap), nothing about your account or your files.
- Community widgets run in an `iframe` with `sandbox="allow-scripts"` and without `allow-same-origin`: they have an
  opaque origin and no access to the app.

## Supported versions

Only the latest release receives fixes. Updates arrive through the app (Settings > Updates) and are **signed**: the
app refuses an update that does not verify against the public key embedded in it.

## Release integrity

Installers are built by GitHub Actions from a tag on `main`, signed with the updater key, and carry a build
provenance attestation: `gh attestation verify <installer> --repo iSweat-exe/yet-another-reader`.
