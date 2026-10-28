// The backend serializes non-finite floats (e.g. psnr = +inf for a perfectly
// reconstructed block/image, or compression_ratio = +inf for 0 bpp) as JSON
// null, since IEEE Infinity isn't valid JSON. Render those as "∞" instead of
// crashing on `null.toFixed(...)`.
export function fmt(value, digits = 2, suffix = '') {
  if (value === null || value === undefined) return '∞'
  return `${Number(value).toFixed(digits)}${suffix}`
}

// Same idea, but signed (for delta rows): shows a leading "+" for positive values.
export function fmtSigned(value, digits = 2, suffix = '') {
  if (value === null || value === undefined) return '∞'
  const n = Number(value)
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}${suffix}`
}
