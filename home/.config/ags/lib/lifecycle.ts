import GLib from "gi://GLib?version=2.0"

let current: ResourceScope | null = null
const cancellations = new Map<number, () => void>()
export class ResourceScope {
  disposed = false
  private cleanups = new Set<() => void>()
  run<T>(callback: () => T): T {
    const previous = current
    current = this
    try { return callback() } finally { current = previous }
  }
  add(cleanup: () => void) {
    if (this.disposed) cleanup()
    else this.cleanups.add(cleanup)
    return () => this.cleanups.delete(cleanup)
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const cleanup of this.cleanups) {
      try { cleanup() } catch (error) { console.error("Resource cleanup:", error) }
    }
    this.cleanups.clear()
  }
}
export function onCleanup(callback: () => void) { return current?.add(callback) }
export function scopeCallback<T extends (...args: any[]) => any>(callback: T): T {
  const scope = current
  return ((...args: any[]) => {
    if (scope?.disposed) return
    return scope ? scope.run(() => callback(...args)) : callback(...args)
  }) as T
}
function source(priority: number, interval: number | null, callback: () => boolean) {
  const scope = current
  if (scope?.disposed) return 0
  let id = 0
  let forget: (() => void) | undefined
  const wrapped = () => {
    if (scope?.disposed) { forget?.(); cancellations.delete(id); return GLib.SOURCE_REMOVE }
    let keep = false
    try { keep = scope ? scope.run(callback) : callback() }
    catch (error) { console.error("Widget timer:", error) }
    if (!keep) { forget?.(); cancellations.delete(id) }
    return keep
  }
  id = interval === null ? GLib.idle_add(priority, wrapped) : GLib.timeout_add(priority, interval, wrapped)
  forget = scope?.add(() => { cancellations.delete(id); GLib.source_remove(id) })
  cancellations.set(id, () => { forget?.(); cancellations.delete(id); GLib.source_remove(id) })
  return id
}
export function timeout(priority: number, milliseconds: number, callback: () => boolean) {
  return source(priority, milliseconds, callback)
}
export function idle(priority: number, callback: () => boolean) { return source(priority, null, callback) }

export function cancelSource(id: number) {
  const cancel = cancellations.get(id)
  if (cancel) cancel()
  else GLib.source_remove(id)
}
