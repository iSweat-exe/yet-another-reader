# Publishing a release

The maintainer's guide: automatic updates, keys, CI/CD, labels and the rules of the repository.

## How it works

```text
tag vX.Y.Z on main ──► release.yml ──► signed installer (.exe) + latest.json ──► DRAFT release
                                                                                      │ you publish it
                                                                                      ▼
installed app ──► GET .../releases/latest/download/latest.json ──► a newer version?
      ▲                                                                              │ yes
      └──── offers it in Settings > Updates ◄────────────────────────────────────────┘
            (nothing is installed without a click, and the signature is checked with the app's public key)
```

- The app looks for an update 20 s after it starts, then every 6 h (setting **Settings > Updates > Check
  automatically**), and on demand with **Check**.
- An update that is found shows at the top right of the window. A click opens what's new and the **Install and
  restart** button.
- The installer is signed with the **private key** of the updater. The app carries the **public key**
  (`src-tauri/tauri.conf.json`, `plugins.updater.pubkey`) and refuses anything that does not match.

## The keys (the `.secret/` folder)

`.secret/` is in `.gitignore` and **must never be committed** (the secret scan of the CI fails if the private key
shows up in the repository, history included).

| File | Role |
| --- | --- |
| `.secret/updater.key` | **Private** key: signs the updates. |
| `.secret/updater.password` | Password of that key. |
| `.secret/updater.key.pub` | Public key (already copied into `tauri.conf.json`). |

> **Back up `updater.key` and `updater.password` somewhere else** (password manager, encrypted disk). If either is
> lost, no update can be signed any more: installed apps will not be able to update, and every user would have to
> reinstall by hand a version that carries a new public key. Changing the key has the same effect: only do it after a
> leak.

To create a new pair (at the very beginning, before any published version):

```bash
npx tauri signer generate -w .secret/updater.key
```

then paste the content of `.secret/updater.key.pub` into `plugins.updater.pubkey` of `src-tauri/tauri.conf.json`.

## Once: the GitHub secrets

The CI signs with the same files, copied into the secrets of the repository (Settings > Secrets and variables >
Actions).

**PowerShell** (Windows): the `<` operator does not exist, and sending the text through a pipe would add a line break
that corrupts the password. Pass the values with `--body`:

```powershell
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo iSweat-exe/yet-another-reader --body (Get-Content .secret/updater.key -Raw).Trim()
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo iSweat-exe/yet-another-reader --body (Get-Content .secret/updater.password -Raw).Trim()
```

**Bash** (Git Bash, macOS, Linux):

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo iSweat-exe/yet-another-reader < .secret/updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo iSweat-exe/yet-another-reader < .secret/updater.password
```

Then check: `gh secret list --repo iSweat-exe/yet-another-reader` must show both names. (`gh` is at
<https://cli.github.com>, signed in with `gh auth login`.) These two secrets exist only for `release.yml`.

## Once: the repository

1. **Address of the repository.** `src-tauri/tauri.conf.json` (`plugins.updater.endpoints`) and the links in
   `.github/` assume `https://github.com/iSweat-exe/yet-another-reader`. If the repository has another name, replace
   that address (`grep -rn "iSweat-exe/yet-another-reader" .`) **before the first published version**: an installed
   app keeps the address it was built with.
2. **Default branch**: `main`.
3. **Labels**: push `main`; the *Sync labels* workflow creates the labels of `.github/labels.yml`.
4. **Rules**: import the files of `.github/rulesets/` (see its `README.md`).
5. **Actions**: Settings > Actions > General > *Workflow permissions*: "Read repository contents" by default (each
   workflow asks for what it needs itself); allow *Allow GitHub Actions to create and approve pull requests* only if
   you want workflows to open some.
6. **Security**: Settings > Code security: turn on *Dependency graph*, *Dependabot alerts* and *Dependabot security
   updates*, *Secret scanning* with *Push protection* (blocks a push that contains a secret), and *Private
   vulnerability reporting* (used by `SECURITY.md`).

## Publishing a version

Version numbers follow [SemVer](https://semver.org). Before 1.0.0 they are `0.Y.Z`, where a breaking change (API,
layout format, settings) bumps `Y`.

1. **Update the versions** (one number in 5 files):

   ```bash
   npm run version:set -- 1.0.0
   git switch -c release/1.0.0
   git commit -am "chore(release): 1.0.0"
   ```

   Open the pull request, let the CI pass, merge (squash). The CI checks that the files agree
   (`npm run version:check`).
2. **Create the tag on the merged commit of `main`**:

   ```bash
   git switch main && git pull
   git tag v1.0.0
   git push origin v1.0.0
   ```

   For a pre-release, `v1.0.0-rc.1`: it is marked *pre-release* and **apps do not receive it** (the `latest` address
   ignores pre-releases).
3. **`release.yml` works**: it checks that the tag matches the versions and comes from `main`, builds the NSIS
   installer, signs it, creates the release **as a draft** with `latest.json`, attests the provenance of the file and
   writes the notes from the merged pull requests (grouped by label, see `.github/release.yml`).
4. **Review the draft** (Releases): notes, files (`*-setup.exe`, `*-setup.exe.sig`, `latest.json`). Test the
   installer on a clean machine if you can.
5. **Publish.** This is the moment installed apps see the update.

### Withdrawing a version

- A faulty version: unpublish the release (back to draft). `latest.json` goes back to the previous version's and
  nobody receives the bad one any more. Those who already installed it do not go back: publish a fixed version
  quickly (`Z + 1`).
- Do not delete or move a published tag (the `release-tags.json` rule forbids it): fix forward.

## Building locally

`createUpdaterArtifacts` makes `tauri build` refuse to run without a signing key. This script reads it from
`.secret/`:

```bash
npm run build:signed
```

The installer is in `target/release/bundle/nsis/`.

## Testing the update path end to end

1. Install a `0.1.0` built with `npm run build:signed`.
2. Raise the version (`npm run version:set -- 0.1.1`), rebuild, and publish as a **draft** on a test repository, or
   host `latest.json` and the installer on a local server and point `plugins.updater.endpoints` at it for this test
   (`http://localhost:...` only works with `dangerousInsecureTransportProtocol`, which must not be left in).
3. In the 0.1.0 app: **Settings > Updates > Check** must offer 0.1.1.

In development (`npm run tauri dev`) the check also runs, but with no published release it answers "404": that is
normal, the line shows in the journal (Status > Debug) without disturbing anything.

## Labels, issues and pull requests

- **Labels** come from `.github/labels.yml` (families `type:`, `area:`, `status:`, `priority:`). Edit that file, not the
  interface: the workflow resynchronises and deletes the labels that are not in it.
- A **pull request** gets its `area:` labels from the files it changes (`.github/labeler.yml`) and its `type:` label
  from its title. The title follows Conventional Commits (`fix(reader): follow replays`); it becomes the commit
  message and a line of the release notes.
- **Issues** go through the forms of `.github/ISSUE_TEMPLATE/` (bug, feature, an osu!lazer update that breaks the
  reader). They arrive with `status: needs triage`. `status: needs info` closes the issue after 21 days without an
  answer.
- **Dependabot** opens one grouped pull request a week for npm, cargo and the actions.

## Dependencies and advisories

`.cargo/audit.toml` ignores three RustSec advisories about the `zip` crate, which `tauri-plugin-updater` pulls in and
which does not apply on Windows (the justification is in the file). When updating Tauri, check whether the plugin
now uses `zip` 9 or later, and if so delete those lines.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `release.yml`: "failed to decode secret key" | `TAURI_SIGNING_PRIVATE_KEY` or its password was copied wrongly into the secrets. Run `gh secret set` again. |
| `release.yml`: "tag does not match" | The versions of the files are not the tag's: `npm run version:set -- X.Y.Z`, new PR, new tag. |
| `release.yml`: "not on main" | The tag is on a branch. Merge first, then tag the commit of `main`. |
| The app offers nothing | The release is still a draft, or it is a pre-release, or its number is not greater than the installed one. |
| "signature verification failed" | The installer was not signed with the key that matches the app's public key. |
| A pull request is blocked by "Expected" on a check | The name of the check matches no job: see `.github/rulesets/README.md`. |
