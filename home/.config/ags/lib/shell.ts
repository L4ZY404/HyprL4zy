import { execAsync as agsExecAsync } from "ags/process"
import GLib from "gi://GLib?version=2.0"

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function commandExists(command: string) {
  return GLib.find_program_in_path(command) !== null
}

export function getHomeDir() {
  return GLib.get_home_dir()
}

export function readFile(path: string) {
  try {
    const [ok, contents] = GLib.file_get_contents(path)

    if (!ok || !contents) {
      return ""
    }

    return new TextDecoder().decode(contents).trim()
  } catch {
    return ""
  }
}

export function writeFile(path: string, content: string) {
  try {
    GLib.file_set_contents(path, content)
    return true
  } catch {
    return false
  }
}

export function fileExists(path: string) {
  return GLib.file_test(path, GLib.FileTest.EXISTS)
}

export function exec(command: string) {
  try {
    const [ok, stdout] = GLib.spawn_command_line_sync(command)

    if (!ok || !stdout) {
      return ""
    }

    return new TextDecoder().decode(stdout).trim()
  } catch {
    return ""
  }
}

export async function execAsync(command: string | string[]) {
  try {
    // Parse command output consistently on non-English installations.
    const args = Array.isArray(command) && ["bash", "sh"].includes(command[0]) && command[1] === "-c"
      ? [command[0], command[1], `export LC_ALL=C\n${command[2]}`] : command
    const output = await agsExecAsync(args as any)
    return String(output ?? "").trim()
  } catch {
    return ""
  }
}

export function spawn(command: string) {
  try {
    GLib.spawn_command_line_async(command)
    return true
  } catch {
    return false
  }
}

export function execShell(script: string) {
  return exec(`sh -c ${shellQuote(script)}`)
}

export async function execShellAsync(script: string) {
  return execAsync(["bash", "-c", script])
}

export function readJson<T>(raw: string, fallback: T): T {
  if (!raw.trim()) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

// Use this for probes whose callers must distinguish failure from empty output.
export async function execAsyncStrict(command: string | string[]) {
  const args = Array.isArray(command) && ["bash", "sh"].includes(command[0]) && command[1] === "-c"
    ? [command[0], command[1], `export LC_ALL=C\n${command[2]}`] : command
  return String(await agsExecAsync(args as any) ?? "").trim()
}
