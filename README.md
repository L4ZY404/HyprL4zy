# HyprL4zy

> [!WARNING]
> **Beta software.** HyprL4zy is still under active development and may include breaking changes.

A modular **Arch Linux + Hyprland** rice built with **AGS GTK4, GJS and Astal**, with Pywal integration, contextual widgets and a configurable vertical bar.

<p align="center">
  <a href="assets/screenshots/01.png"><img src="assets/screenshots/01.png" width="19%" alt="HyprL4zy screenshot 01"></a>
  <a href="assets/screenshots/02.png"><img src="assets/screenshots/02.png" width="19%" alt="HyprL4zy screenshot 02"></a>
  <a href="assets/screenshots/03.png"><img src="assets/screenshots/03.png" width="19%" alt="HyprL4zy screenshot 03"></a>
  <a href="assets/screenshots/04.png"><img src="assets/screenshots/04.png" width="19%" alt="HyprL4zy screenshot 04"></a>
  <a href="assets/screenshots/05.png"><img src="assets/screenshots/05.png" width="19%" alt="HyprL4zy screenshot 05"></a>
</p>

## Features

- Modular AGS vertical bar and islands
- Pywal-based dynamic colors
- Bar Editor with drag-and-drop layout editing
- Theme Studio with image and video wallpapers
- Dynamic workspaces and contextual module panels
- Dunst notifications, Swaylock Effects, Fastfetch and Cava
- Desktop and laptop-oriented configuration
- Modular Arch Linux installer with backups and restore

## Install

```bash
git clone https://github.com/L4ZY404/HyprL4zy.git
cd HyprL4zy
./install.sh plan
./install.sh install
```

After installation:

```bash
./install.sh doctor
```

The installer can configure `pacman`, bootstrap `yay`, install Powerlevel10k and install the packages required by HyprL4zy. During an interactive install it also asks whether you want the optional **Dynamic Bubble SDDM** theme.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Super + B` | Toggle bar |
| `Super + Shift + B` | Bar Editor |
| `Super + R` | Restart AGS |
| `Super + H` | Shortcuts |
| `Super + P` | Power menu |

## Local configuration

Machine-specific files such as `local.json` and `local.conf` are intentionally kept outside the public configuration and preserved by updates.

## License

Licensed under the **GNU GPL v3.0**. See [LICENSE](LICENSE).
