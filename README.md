# HyprL4zy

> [!WARNING]
> **HyprL4zy is beta software.** The project is under active development and updates may introduce breaking changes.

A modular **Arch Linux + Hyprland** desktop built around **Quickshell/QML**, contextual controls, Pywal colors and a fixed vertical island bar.

HyprL4zy is designed as a complete desktop layer rather than a collection of disconnected widgets: the shell, Studios, notifications, wallpaper handling, system controls and installer are developed together and share the same visual language.

<p align="center">
  <a href="assets/screenshots/01.png">
    <img src="assets/screenshots/01.png" width="100%" alt="HyprL4zy Wallpaper Studio">
  </a>
</p>

<table>
  <tr>
    <td width="50%" align="center">
      <a href="assets/screenshots/02.png">
        <img src="assets/screenshots/02.png" width="100%" alt="HyprL4zy desktop and vertical bar">
      </a>
      <br><sub><b>Desktop & vertical bar</b></sub>
    </td>
    <td width="50%" align="center">
      <a href="assets/screenshots/03.png">
        <img src="assets/screenshots/03.png" width="100%" alt="HyprL4zy Application Studio">
      </a>
      <br><sub><b>Application Studio</b></sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="assets/screenshots/04.png">
        <img src="assets/screenshots/04.png" width="100%" alt="HyprL4zy Theme and Shell panel">
      </a>
      <br><sub><b>Theme / Shell</b></sub>
    </td>
    <td width="50%" align="center">
      <a href="assets/screenshots/05.png">
        <img src="assets/screenshots/05.png" width="100%" alt="HyprL4zy Power and Session panel">
      </a>
      <br><sub><b>Power / Session</b></sub>
    </td>
  </tr>
</table>

## Highlights

* **Quickshell/QML shell** with a fixed vertical island bar.
* **Contextual module panels** instead of one monolithic settings center.
* **Application Studio** with search, favorites and recent applications.
* **Wallpaper Studio** with image, WebP and live-video wallpaper support.
* **Pywal integration** using the wallpaper palette across the shell.
* **Native Quickshell integrations** for Hyprland, system tray, MPRIS, PipeWire, UPower, Bluetooth and NetworkManager.
* **iwd fallback** for Wi-Fi systems where NetworkManager is not the active stack.
* **Custom notifications** and notification center integrated into the shell.
* **Responsive multi-monitor layout** with machine-specific monitor configuration kept outside the managed defaults.
* **Incremental installer/updater** with backups, restore support and preservation of local settings.
* **Optional Dynamic Bubble SDDM integration** without silently replacing an existing SDDM setup.

## Studios and contextual surfaces

### Application Studio

Open with `Super + Space`.

Application Studio provides a keyboard-friendly application launcher with search, favorites and recent-app tracking. It is implemented as a native Quickshell surface and does not depend on a separate launcher for its primary workflow.

### Wallpaper Studio

Open with `Super + W`.

Wallpaper Studio can browse and apply static images, WebP files and video wallpapers. Wallpaper changes refresh the Pywal palette so the shell can follow the selected background.

The default wallpaper directory is:

```text
~/Pictures/Wallpapers
```

### Theme / Shell

Open with `Super + Shift + B` or from the Arch/Theme island.

This surface controls shell-facing theme options such as the active Pywal accent slot while keeping the wallpaper as the source of the desktop palette.

### Notifications

Open with `Super + N`.

Notifications are handled by HyprL4zy's Quickshell notification layer and notification center, including Do Not Disturb controls.

### Power / Session

Open with `Super + P`.

The power surface provides power off, reboot, sleep, logout and lock actions in a compact keyboard-navigable panel.

## Installation

HyprL4zy targets **Arch Linux** and expects to be installed from a normal user account with `sudo` access for package and system-level changes.

Clone the repository:

```bash
git clone https://github.com/L4ZY404/HyprL4zy.git
cd HyprL4zy
```

Preview what the installer will do:

```bash
./install.sh plan
```

Install HyprL4zy:

```bash
./install.sh install
```

Then run the built-in diagnostics:

```bash
./install.sh doctor
```

### Minimal installation

Use `--minimal` to skip the optional user-facing desktop programs bundle:

```bash
./install.sh install --minimal
```

### Non-interactive package prompts

Use `--yes` when you want the installer to accept package-manager prompts and the optional Zsh shell change automatically:

```bash
./install.sh install --yes
```

## Updating HyprL4zy

For an existing installation:

```bash
git pull --ff-only
./install.sh plan
./install.sh update
./install.sh doctor
```

The updater is intentionally conservative. It:

* copies only managed files that actually changed;
* installs only missing required packages;
* does not reinstall optional desktop programs that the user intentionally removed;
* preserves machine-specific and runtime settings;
* removes obsolete files only when they were previously managed by HyprL4zy;
* avoids creating a backup when nothing needs to be replaced;
* leaves an existing Dynamic Bubble installation untouched unless explicitly asked to refresh it.

## Installer commands

| Command                            | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `./install.sh list`                | Show package/component information            |
| `./install.sh plan`                | Preview changes without installing            |
| `./install.sh install`             | Install HyprL4zy                              |
| `./install.sh update`              | Incrementally update an existing installation |
| `./install.sh doctor`              | Check the installed environment               |
| `./install.sh backups`             | List available installer backups              |
| `./install.sh restore latest`      | Restore the most recent backup                |
| `./install.sh restore BACKUP_PATH` | Restore a specific backup                     |

Useful options:

| Option           | Behavior                                         |
| ---------------- | ------------------------------------------------ |
| `--minimal`      | Skip the optional desktop-program bundle         |
| `--yes`, `-y`    | Accept supported installer/package prompts       |
| `--with-sddm`    | Install or explicitly refresh Dynamic Bubble     |
| `--without-sddm` | Guarantee that the installer does not touch SDDM |

Backups are stored in:

```text
~/.local/state/hyprlazy/backups/
```

## Keyboard shortcuts

| Shortcut            | Action                         |
| ------------------- | ------------------------------ |
| `Super + Space`     | Application Studio             |
| `Super + W`         | Wallpaper Studio               |
| `Super + N`         | Notifications / Do Not Disturb |
| `Super + P`         | Power / Session                |
| `Super + B`         | Show / hide the bar            |
| `Super + Shift + B` | Theme / Shell                  |
| `Super + H`         | Shortcut help                  |
| `Super + R`         | Restart Quickshell             |
| `Super + Shift + R` | Reload Hyprland                |

## Wallpapers

Repository wallpapers live in:

```text
home/Pictures/Wallpapers/
```

During installation they are seeded into:

```text
~/Pictures/Wallpapers/
```

The updater treats this as user-owned content: bundled wallpapers that are missing can be added, but existing wallpapers are **never replaced or deleted** by a normal HyprL4zy update.

Wallpaper Studio uses `~/Pictures/Wallpapers` by default, and the directory can be changed from the Studio itself.

## Local configuration and portability

HyprL4zy avoids publishing machine-specific monitor layouts, usernames and personal wallpaper/weather state as global defaults.

Two important files are created locally and preserved during normal updates:

```text
~/.config/hypr/local.conf
~/.config/quickshell/hyprl4zy/settings.json
```

Their portable templates are stored in the repository as:

```text
home/.config/hypr/local.example.conf
home/.config/quickshell/hyprl4zy/settings.example.json
```

`local.conf` is intended for monitor/input overrides specific to one machine. `settings.json` stores runtime preferences such as the wallpaper directory/current wallpaper, weather settings, launcher favorites and recent applications.

This separation lets the public dotfiles evolve without overwriting each user's machine-specific state.

## SDDM integration

HyprL4zy can optionally install the author's **Dynamic Bubble** SDDM theme:

```text
https://github.com/L4ZY404/SDDM-THEME-Dynamic_bubble
```

The default behavior is deliberately safe:

* if Dynamic Bubble is already installed, HyprL4zy detects it and leaves it unchanged;
* on an interactive first install, the installer can ask whether to install it;
* unattended runs skip SDDM unless `--with-sddm` is supplied;
* `--without-sddm` guarantees that SDDM is not modified.

## Project structure

```text
HyprL4zy/
├── assets/
│   └── screenshots/
│       ├── 01.png
│       ├── 02.png
│       ├── 03.png
│       ├── 04.png
│       └── 05.png
├── home/
│   ├── .config/
│   │   ├── hypr/
│   │   └── quickshell/
│   │       └── hyprl4zy/
│   ├── Pictures/
│   │   └── Wallpapers/
│   └── .zshrc
├── installer/
│   ├── lib/
│   ├── manifests/
│   └── modules/
├── tests/
├── install.sh
├── LICENSE
└── README.md
```

Package manifests under `installer/manifests/` are the source of truth for required, AUR, optional and user-facing packages.

## Troubleshooting

Start with:

```bash
./install.sh doctor
```

For Quickshell startup problems, the session launcher writes diagnostic information under HyprL4zy's state directory. You can also restart the shell with:

```text
Super + R
```

If an installer update changed managed files and you need to roll back, inspect the available backups:

```bash
./install.sh backups
```

and restore the latest one with:

```bash
./install.sh restore latest
```

## Development status

HyprL4zy is still evolving. The current direction is centered on **Quickshell/QML**, contextual module surfaces, responsive sizing and safe public-dotfile installation. Older AGS/Astal-based layouts are no longer the project baseline.

Bug reports and reproducible hardware-specific issues are especially useful while the project is in beta.

## License

HyprL4zy is licensed under the **GNU General Public License v3.0**. See [LICENSE](LICENSE) for the full license text.
