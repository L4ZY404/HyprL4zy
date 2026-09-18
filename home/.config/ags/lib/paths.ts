import GLib from "gi://GLib?version=2.0"

export const CONFIG_HOME = GLib.get_user_config_dir()
export const CACHE_HOME = GLib.get_user_cache_dir()
export const STATE_HOME = GLib.getenv("XDG_STATE_HOME") || `${GLib.get_home_dir()}/.local/state`
export const AGS_DIR = `${CONFIG_HOME}/ags`
