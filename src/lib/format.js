// Small formatting helpers, shared by the charts and the table.

export function compact(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}m`
  if (n >= 10000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function percent(fraction) {
  return `${Math.round(fraction * 100)}%`
}

export function signed(n) {
  return n > 0 ? `+${n}` : String(n)
}

// -0.42 reads better than -0.4200000001
export function score(n) {
  const fixed = n.toFixed(2)
  return fixed === '-0.00' ? '0.00' : fixed
}

export function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
