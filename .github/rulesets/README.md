# Rulesets

Rules of the repository, as files GitHub can import. They do nothing until imported, and importing is done once.

**Settings > Rules > Rulesets > New ruleset > Import a ruleset**, then pick a file:

| File | What it enforces |
| --- | --- |
| [`main.json`](main.json) | `main` cannot be deleted or force-pushed, history stays linear, every change goes through a pull request (squash merge only, conversations resolved) and passes the checks **Frontend**, **Rust (Windows)**, **Conventional title** and **Secret scan**, on a branch up to date with `main`. |
| [`release-tags.json`](release-tags.json) | Tags `v*` can be created only by a repository admin, and can never be moved or deleted: a published version stays what it was. |
| [`branch-names.json`](branch-names.json) | New branches are named `type/short-description` (`feat/…`, `fix/…`, `docs/…`…), like the commit types. Dependabot branches are exempt. |

## Before importing

1. **The check names must exist.** A required check that never ran blocks every pull request. Merge the workflows
   (`.github/workflows/ci.yml`, `pr-title.yml`, `security.yml`) and let them run once before enabling `main.json`,
   or import it with *Enforcement: Evaluate* first and switch to *Active* when the checks show up.
2. **The default branch must be `main`.** The rules say `~DEFAULT_BRANCH`, so any name would work, but the workflows
   and the release job assume `main`.
3. **Admins can bypass.** `bypass_actors` lists the repository role *Admin* (`actor_id` 5). On `main` the bypass only
   works from a pull request (`pull_request`), so even the owner does not push to `main` by accident.

## Working alone, then with others

`main.json` asks for **0 approvals**, because GitHub does not let you approve your own pull request and you would be
locked out. When someone else joins, raise `required_approving_review_count` to `1` and set
`require_code_owner_review` to `true` (see [`CODEOWNERS`](../CODEOWNERS)): edit the ruleset in the web interface,
then export it again to keep this file true.

## Keeping the files and the settings in step

A ruleset is not synchronised automatically: after changing one in the web interface, use **Export** and replace the
file here, so the repository documents what is really enforced.
