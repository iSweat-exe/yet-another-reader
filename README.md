# Yet Another Reader

[![CI](https://github.com/iSweat-exe/yet-another-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/iSweat-exe/yet-another-reader/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/iSweat-exe/yet-another-reader?label=version)](https://github.com/iSweat-exe/yet-another-reader/releases/latest)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A state reader for **osu!lazer** (Windows): an **in-game overlay** you compose in an editor, a **local API**
(HTTP + WebSocket) and **community widgets** written in plain HTML. It is **read-only**: nothing is modified in
the game, nothing is injected, no input is simulated.

> **Not affiliated with osu!.** Yet Another Reader is an independent project. It is not made, endorsed or
> supported by ppy Pty Ltd or the osu! team. "osu!" and "osu!lazer" belong to their owners.

## Install and update

Download the installer from the [latest release](https://github.com/iSweat-exe/yet-another-reader/releases/latest)
(Windows 10 or 11, 64-bit). The installer is available in English and French.

After that, the app **updates itself**: it offers new versions (**Settings > Updates**) and only installs one when
you say so, after checking its signature against the public key built into the app.

Windows may show "Windows protected your PC" (SmartScreen) because the installer is not yet signed with a
code-signing certificate: click **More info**, then **Run anyway**. Every installer comes with a build provenance
attestation you can verify: `gh attestation verify <installer> --repo iSweat-exe/yet-another-reader`.

## Privacy

There is no telemetry and no account. The only connection the app makes on its own is the **update check**, a
request to `github.com` (turn it off in **Settings > Updates**). Nothing from your game leaves your computer: the
local API listens on `127.0.0.1` only and only answers requests addressed to your own machine.

## Documentation

The full documentation is in the app (**Documentation** tab) and in the [`docs/en/`](docs/en) folder
(French originals in [`docs/`](docs)):

| Page | Content |
| --- | --- |
| [Getting started](docs/en/GETTING_STARTED.md) | Installation and first launch |
| [Create an overlay](docs/en/CREATE_OVERLAY.md) | Step-by-step tutorial |
| [Editor](docs/en/EDITOR.md) | Placement, groups, spacing, layouts |
| [In-game overlay](docs/en/OVERLAY.md) | Performance, fullscreen, RTSS |
| [Settings](docs/en/SETTINGS.md) | Every setting |
| [Built-in widgets](docs/en/BUILTIN_WIDGETS.md) | The widget catalogue |
| [Community widgets](docs/en/WIDGETS.md) | Make a widget in HTML/CSS/JS |
| [Layout format](docs/en/LAYOUT.md) | The JSON of a layout |
| [Local API](docs/en/API.md) | REST, WebSocket, events |
| [Architecture](docs/en/ARCHITECTURE.md) | How the project is built |
| [Contributing](docs/en/CONTRIBUTING.md) | Environment, conventions, pull requests |
| [Troubleshooting](docs/en/TROUBLESHOOTING.md) | Common problems |

## Develop

```bash
npm install
npm run tauri dev
```

See [Contributing](docs/en/CONTRIBUTING.md) for the prerequisites and the commands. Maintainers publish releases
with the guide [.github/RELEASING.md](.github/RELEASING.md).

## Security

To report a vulnerability privately, see [SECURITY.md](.github/SECURITY.md).

## License

[MIT](LICENSE)
