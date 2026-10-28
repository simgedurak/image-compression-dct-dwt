// Renders an 8x8 (or NxN) numeric matrix, with a coloring `mode`:
//   'grayscale' - value in [0, 255] maps directly to a gray background
//                 (this is what the pixels actually look like), with
//                 high-contrast (white/black) text.
//   'blue'      - flat light-blue backdrop, for the level-shifted block.
//   'diverging' - red for positive / blue for negative, intensity scaled
//                 by |value| relative to the matrix's own max magnitude.
//   (default)   - plain white cells.
// `highlightDC` rings the [0, 0] (DC) cell in amber.
export default function MatrixGrid({ matrix, mode, highlightDC = false, decimals = 1 }) {
  if (!matrix || matrix.length === 0) return null

  const flat = matrix.flat()
  const maxAbs = Math.max(1e-9, ...flat.map((v) => Math.abs(v)))

  function cellStyle(value) {
    if (mode === 'grayscale') {
      const v = Math.max(0, Math.min(255, value))
      return { backgroundColor: `rgb(${v}, ${v}, ${v})` }
    }
    if (mode === 'blue') {
      return { backgroundColor: '#dbeafe' }
    }
    if (mode === 'diverging') {
      const intensity = Math.min(1, Math.abs(value) / maxAbs)
      const color =
        value >= 0 ? `rgba(239,68,68,${0.12 + intensity * 0.55})` : `rgba(59,130,246,${0.12 + intensity * 0.55})`
      return { backgroundColor: color }
    }
    return {}
  }

  function textClass(value) {
    if (mode === 'grayscale') {
      const v = Math.max(0, Math.min(255, value))
      return v < 128 ? 'text-white' : 'text-black'
    }
    if (mode === 'blue') return 'text-blue-900'
    return 'text-slate-700'
  }

  return (
    <div
      className="grid gap-[2px] rounded-md border border-slate-200 bg-slate-200 p-[2px]"
      style={{ gridTemplateColumns: `repeat(${matrix[0].length}, minmax(0, 1fr))` }}
    >
      {matrix.map((row, i) =>
        row.map((value, j) => {
          const isDC = highlightDC && i === 0 && j === 0
          return (
            <div
              key={`${i}-${j}`}
              style={cellStyle(value)}
              className={`flex aspect-square min-w-0 items-center justify-center bg-white font-mono text-[10px] ${textClass(
                value
              )} ${isDC ? 'ring-2 ring-inset ring-amber-500' : ''}`}
              title={`(${i}, ${j}) = ${value}`}
            >
              {Number(value).toFixed(decimals)}
            </div>
          )
        })
      )}
    </div>
  )
}
