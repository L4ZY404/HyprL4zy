# HyprLazy

> [!WARNING]
> **BETA SOFTWARE**
>
> HyprLazy is currently in **beta / pre-release development**.
> The configuration is usable for testing, but breaking changes, layout changes,
> dependency changes, and installer changes may still happen before the first stable release.
>
> **Do not treat the current repository as a finished 1.0 release.**
> Back up your existing dotfiles before testing it on another system.

HyprLazy is a modular Arch Linux + Hyprland rice built around **AGS GTK4**, **GJS**, and **Astal**.

HyprLazy focuses on a clean vertical bar, contextual widgets, smooth motion, Pywal integration, portability between desktop and laptop systems, and a modular structure that can eventually be installed and updated safely from a single installer.

## Status

**Current project status:** Beta / active development

The project is already functional, but it is still being polished before the first stable public release.

Current priorities:

- stability
- portability
- consistent visual language
- safe drag-and-drop behavior
- contextual widget controls
- clean installation and rollback
- multi-machine testing
- release-ready documentation

Large architectural rewrites are currently avoided unless they solve a real stability or portability problem.

## Main Features

- Modular vertical AGS bar
- Pywal color integration
- `color11`-based accent system
- Contextual module panels instead of one global settings center
- Configurable Bar Editor
- Drag-and-drop widget and island composition
- Dynamic workspace pills
- Smooth workspace and popover animations
- Dunst notification integration
- Wallpaper / Theme Studio
- Image and video wallpaper support
- Responsive sizing intended for different displays
- Fastfetch configuration included in the rice
- Keyboard-driven power menu
- Modular installer architecture in development
- Desktop and laptop compatibility as a project goal

## Design Philosophy

HyprLazy uses a contextual approach.

Instead of opening one large settings application, each module is intended to expose controls related to its own function.

Examples:

- Wi-Fi → network controls
- Bluetooth → device controls
- Volume → mixer / audio controls
- CPU / temperature / memory → system maintenance
- Weather → detailed forecast
- Clock → calendar
- Updates → package breakdown
- Audio visualizer → audio tools / equalizer

The visual language is based on:

- dark backgrounds
- compact islands
- rounded corners
- Pywal accents
- strong contrast
- subtle motion
- no hover scaling
- no unnecessary widget movement

Hover is used as an interaction signal, not as a transform effect.

## Included Components

The repository is intended to contain the configuration required by the rice, including:

```text
.config/
├── ags/
├── hypr/
├── fastfetch/
└── ...
```

Additional project assets and installer logic may be organized as:

```text
assets/
scripts/
installer/
```

The final repository layout may still change during beta.

## AGS

AGS is the main shell layer of the project.

The current design includes:

- modular islands
- contextual popovers
- Bar Editor
- Theme Studio
- dynamic workspaces
- system widgets
- notification styling integration
- configurable scale and geometry
- portable defaults
- local overrides

Local machine-specific values should remain outside the managed configuration whenever possible.

## Bar Editor

The Bar Editor allows the bar layout to be changed visually.

Current supported interactions include:

- moving widgets
- moving islands
- inserting widgets into islands
- merging islands
- creating empty islands from the widget tray

For stability:

```text
widget → island            allowed
island → island            allowed
island → standalone widget rejected
```

The rejected interaction is intentional.

Previous attempts to make standalone widgets absorb islands caused GTK drag-and-drop instability, so HyprLazy currently performs an early hard reject for that operation.

## Workspaces

Workspace indicators are dynamic pills inside one main workspace island.

Behavior includes:

- empty invisible workspaces are hidden
- visible empty workspaces show a monitor indicator
- occupied workspaces show application icons
- duplicate application icons are deduplicated
- visible occupied workspaces can show both apps and monitor state
- workspace pills resize dynamically
- transitions use subtle reveal and reflow animations

## Fastfetch

A custom Fastfetch configuration is included.

The current design uses:

- custom Space Invader + `404` ASCII art
- terminal palette colors
- Pywal-friendly ANSI colors
- hardware information
- software information
- classic terminal color blocks
- no network section

The configuration is designed to stay self-contained and portable.

## SDDM Theme

HyprLazy is designed to work with the author's custom SDDM theme:

**Dynamic Bubble**

https://github.com/L4ZY404/SDDM-THEME-Dynamic_bubble

SDDM integration will be treated as an **optional installer component** because it modifies system-level files and normally requires root privileges.

The final installer should never silently overwrite an existing SDDM setup.

## Keyboard Shortcuts

Important project shortcuts currently include:

```text
Super + B         Toggle shell / bar
Super + Shift + B Open Bar Editor
Super + R         Restart AGS
Super + H         Open keyboard shortcuts
Super + P         Open power menu
```

Shortcuts may still change during beta.

## Portability

HyprLazy is intended to work across different systems rather than being tied to one machine.

The project avoids relying on:

- hardcoded usernames
- personal absolute paths
- one fixed monitor resolution
- one specific GPU
- one fixed battery layout
- one specific network interface

Where possible, sizing is based on:

- relative units
- proportions
- monitor geometry
- user scale

Machine-specific values should live in local configuration files that are not overwritten by updates.

## Installer

The complete rice installer is **still under development**.

The intended command structure is:

```bash
bash install.sh list
bash install.sh plan
bash install.sh install
bash install.sh update
bash install.sh doctor
bash install.sh backups
bash install.sh restore /path/to/backup
```

Planned installer goals:

- component-based installation
- required vs optional dependencies
- backup before modification
- rollback support
- local configuration preservation
- safe update path
- system diagnostics
- optional SDDM installation
- clean uninstall support
- no silent destructive changes

During beta, installation behavior may still change.

## Dependencies

The exact dependency list is still being finalized for the installer.

Core technologies include:

- Arch Linux
- Hyprland
- AGS GTK4
- GJS
- Astal
- Dunst
- Fastfetch
- Pywal-compatible terminal colors

Additional dependencies are used by individual widgets and features.

The final installer will distinguish between:

```text
required
recommended
optional
AUR
```

dependencies instead of installing everything unconditionally.

## Installation

> [!CAUTION]
> The unified public installer is not finished yet.

For now, this repository should be treated as a development / testing repository.

Before testing on another machine:

```bash
cp -a ~/.config ~/.config.backup
```

Do not overwrite an existing configuration without reviewing the files first.

A proper automated installation flow will be added before the first stable release.

## Local Configuration

Machine-specific settings should not be committed to the repository.

The project uses local overrides where possible.

For example:

```text
local.json
```

A public repository should provide an example/default file instead of publishing personal machine-specific values.

Example:

```text
local.json.example
```

The installer must preserve the user's existing local configuration during updates.

## Beta Limitations

Because HyprLazy is still in beta:

- some UI behavior may change
- dependency names may change
- installer commands may evolve
- configuration files may move
- new modules may be added
- some modules may still need hardware-specific testing
- multi-monitor behavior still needs broader testing
- laptop-specific behavior still needs broader testing
- no stable migration guarantee exists yet

Backups are strongly recommended.

## Testing

Before a build is considered ready, the project aims to validate:

- installer tests
- managed-file hashes
- Bash syntax
- TS / TSX parsing
- JSON / JSONC validity
- Hyprland includes
- clean archive extraction
- update from the previous build
- local configuration preservation
- rollback
- absence of unwanted hardcoded visual pixel values

Rendering behavior must still be tested in a real graphical Hyprland session.

Static validation alone is not considered proof that GTK rendering works correctly.

## Roadmap

Before the first stable release:

- finish the complete rice installer
- test clean installation on another PC
- test installation on a laptop
- finish dependency detection
- finish optional component handling
- finalize SDDM integration
- finish audio tooling / equalizer direction
- review GTK theming
- complete uninstall flow
- finalize README screenshots
- add changelog
- define stable versioning
- select / finalize project license
- prepare the first GitHub release package

## Screenshots

Screenshots will be added closer to the first public stable release.

Suggested future sections:

```text
Desktop
Bar
Bar Editor
Theme Studio
Workspaces
Notifications
Fastfetch
Power Menu
SDDM
```

## Contributions

The project is currently changing quickly.

Bug reports and hardware compatibility feedback are especially useful during beta.

When reporting a problem, include:

```text
GPU
monitor setup
Hyprland version
AGS version
relevant logs
steps to reproduce
```

Avoid including private information in logs or screenshots.

## License

A final project license has not been selected yet.

Do not assume redistribution terms until a license is added to the repository.

---

**HyprLazy is currently BETA software.**

The goal of the beta phase is to make the configuration stable, portable, recoverable, and easy to install before calling it a stable release.
