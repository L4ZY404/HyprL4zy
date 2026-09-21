// Cava raw ASCII frames contain twelve semicolon-separated amplitudes.
function parseFrame(data, count) {
    const parts = data.trim().split(";")
    if (parts[parts.length - 1] === "") parts.pop()
    if (parts.length !== count) return null
    const result = []
    for (let i = 0; i < count; ++i) {
        if (!/^\d+$/.test(parts[i])) return null
        result.push(Math.max(0, Math.min(1, Number(parts[i]) / 1000)))
    }
    return result
}
