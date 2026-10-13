/**
 * Demonstration event content for the Step 06 carousel.
 *
 * Keep this list as the single source of truth for the HTML information layer
 * and the procedural 3D scene. The copy is intentionally replaceable sample
 * content, rather than a claim about real Tripo Club programming.
 */
export const EVENT_CONFIG = [
  {
    id: 'create',
    number: '01',
    title: 'CREATE',
    subtitle: 'CREATIVE LAB',
    description: 'Shape ideas into new dimensions.',
    accent: '#9867FF',
    visualType: 'sculpture',
  },
  {
    id: 'play',
    number: '02',
    title: 'PLAY',
    subtitle: 'INTERACTIVE PLAYGROUND',
    description: 'Enter a world of interactive possibilities.',
    accent: '#368BFF',
    visualType: 'portal',
  },
  {
    id: 'connect',
    number: '03',
    title: 'CONNECT',
    subtitle: 'COMMUNITY SESSIONS',
    description: 'Build, share and connect.',
    accent: '#40D9D0',
    visualType: 'network',
  },
  {
    id: 'explore',
    number: '04',
    title: 'EXPLORE',
    subtitle: 'FUTURE SHOWCASE',
    description: "Discover what's beyond the ordinary.",
    accent: '#E66DCA',
    visualType: 'monolith',
  },
]

export const EVENT_COUNT = EVENT_CONFIG.length

const hexToRgb = (hex) => {
  const value = hex.replace('#', '')
  const expanded = value.length === 3
    ? value.split('').map((character) => `${character}${character}`).join('')
    : value
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ]
}

const EVENT_ACCENT_RGB = EVENT_CONFIG.map((event) => hexToRgb(event.accent))

export const getInterpolatedAccent = (progress) => {
  const safeProgress = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
  const scaled = safeProgress * Math.max(EVENT_COUNT - 1, 1)
  const fromIndex = Math.min(EVENT_COUNT - 1, Math.floor(scaled))
  const toIndex = Math.min(EVENT_COUNT - 1, fromIndex + 1)
  const amount = scaled - fromIndex
  const eased = amount * amount * (3 - 2 * amount)
  const from = EVENT_ACCENT_RGB[fromIndex]
  const to = EVENT_ACCENT_RGB[toIndex]
  const rgb = from.map((channel, index) => Math.round(channel + (to[index] - channel) * eased))
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`
}

export const getEventIndex = (progress) => {
  const safeProgress = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
  return Math.min(EVENT_COUNT - 1, Math.max(0, Math.round(safeProgress * (EVENT_COUNT - 1))))
}
