import { useEffect, useRef } from 'react'

const clamp = (value, minimum = 0, maximum = 1) => (
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
)

const getVisualLabel = (visualType) => {
  switch (visualType) {
    case 'sculpture':
      return 'SCULPTURE FIELD'
    case 'portal':
      return 'PORTAL STUDY'
    case 'network':
      return 'NETWORK STUDY'
    case 'monolith':
      return 'MONOLITH STUDY'
    default:
      return 'SPATIAL STUDY'
  }
}

/**
 * The readable handoff layer for an expanded event.
 *
 * The parent owns the transition state and decides when this component should
 * be mounted. Keeping the dialog self-contained means it can be placed above
 * the persistent WebGL canvas without creating another animation system.
 */
function EventDetail({
  event,
  phase = 'expanded',
  progress = null,
  onClose,
  onRequestClose,
  reducedMotion = false,
  returnFocusTo = null,
  suppressFocusRestoreRef = null,
  onOpenMenu,
  navigationOpen = false,
}) {
  const closeButtonRef = useRef(null)
  const previouslyFocusedRef = useRef(null)
  const didFocusRef = useRef(false)
  const requestClose = onRequestClose || onClose
  const hasProgress = Number.isFinite(progress)
  const safeProgress = hasProgress ? clamp(progress) : 1
  const phaseRef = useRef(phase)
  const requestCloseRef = useRef(requestClose)

  phaseRef.current = phase
  requestCloseRef.current = requestClose

  useEffect(() => {
    if (!event || navigationOpen) return undefined

    previouslyFocusedRef.current = returnFocusTo || document.activeElement

    const handleKeyDown = (keyboardEvent) => {
      if (keyboardEvent.key === 'Escape') {
        keyboardEvent.preventDefault()
        requestCloseRef.current?.()
        return
      }

      // Keep keyboard focus inside the dialog while it is active. The close
      // control is intentionally the only interactive element in this sample
      // detail view, so cycling Tab is deterministic and mobile-safe.
      if (keyboardEvent.key === 'Tab' && closeButtonRef.current) {
        const controls = Array.from(
          document.querySelectorAll('.event-detail button:not([disabled])'),
        ).filter((control) => control.offsetParent !== null)
        if (controls.length === 0) return
        const firstControl = controls[0]
        const lastControl = controls[controls.length - 1]
        const active = document.activeElement
        if (keyboardEvent.shiftKey && active === firstControl) {
          keyboardEvent.preventDefault()
          lastControl.focus({ preventScroll: true })
        } else if (!keyboardEvent.shiftKey && active === lastControl) {
          keyboardEvent.preventDefault()
          firstControl.focus({ preventScroll: true })
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const previous = previouslyFocusedRef.current
      if (
        !suppressFocusRestoreRef?.current
        && previous
        && typeof previous.focus === 'function'
        && document.contains(previous)
      ) {
        previous.focus({ preventScroll: true })
      }
    }
  }, [event, navigationOpen, returnFocusTo, suppressFocusRestoreRef])

  useEffect(() => {
    if (!event || navigationOpen || didFocusRef.current || phase === 'collapsing') return
    const handoffIsVisible = reducedMotion || phase !== 'collapsing'
    if (!handoffIsVisible) return
    didFocusRef.current = true
    closeButtonRef.current?.focus({ preventScroll: true })
  }, [event, navigationOpen, phase, reducedMotion, safeProgress])

  if (!event) return null

  return (
    <div
      className={`event-detail event-detail--${phase}${reducedMotion ? ' is-reduced-motion' : ''}`}
      style={{
        '--event-accent': event.accent,
        ...(hasProgress ? { '--detail-progress': safeProgress } : {}),
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-detail-title"
      aria-describedby="event-detail-description"
      data-event-id={event.id}
      data-phase={phase}
      aria-hidden={navigationOpen ? true : undefined}
      inert={navigationOpen ? '' : undefined}
    >
      <div className="event-detail-backdrop" aria-hidden="true" />
      <div className="event-detail-shell">
        <div className="event-detail-topline">
          <p className="event-detail-index">
            <span className="event-detail-index-number">{event.number}</span>
            <span className="event-detail-index-rule" aria-hidden="true" />
            <span>EVENT STUDY</span>
          </p>
          <div className="event-detail-actions">
            <button
              className="event-detail-menu"
              type="button"
              onClick={onOpenMenu}
              aria-label="Open spatial navigation from event detail"
              data-magnetic
              data-cursor="hover"
            >
              <span className="magnetic-visual interaction-label">MENU</span>
            </button>
            <button
              ref={closeButtonRef}
              className="event-detail-close"
              type="button"
              onClick={requestClose}
              aria-label="Close event detail and return to events"
              data-magnetic
              data-magnetic-strength="0.13"
              data-magnetic-max="6"
              data-cursor="close"
              data-cursor-accent={event.accent}
            >
              <span className="magnetic-visual interaction-label">
                <span aria-hidden="true">CLOSE</span>
                <span className="event-detail-close-mark" aria-hidden="true">×</span>
              </span>
            </button>
          </div>
        </div>

        <div className="event-detail-content">
          <div className="event-detail-copy">
            <p className="event-detail-eyebrow">{event.subtitle}</p>
            <h2 id="event-detail-title" className="event-detail-title">{event.title}</h2>
            <p id="event-detail-description" className="event-detail-description">{event.description}</p>
            <p className="event-detail-visual-type">
              <span>VISUAL IDENTITY</span>
              <span aria-hidden="true">/</span>
              <span>{getVisualLabel(event.visualType)}</span>
            </p>
          </div>

          <div className="event-detail-stage" aria-label={`${event.title} ${getVisualLabel(event.visualType)}`}>
            <div className="event-detail-stage-grid" aria-hidden="true" />
            <div className="event-detail-stage-orbit event-detail-stage-orbit--outer" aria-hidden="true" />
            <div className="event-detail-stage-orbit event-detail-stage-orbit--inner" aria-hidden="true" />
            <div className={`event-detail-stage-core event-detail-stage-core--${event.visualType}`} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="event-detail-stage-label">
              <span>EXPLORE STAGE</span>
              <span>{getVisualLabel(event.visualType)}</span>
            </p>
          </div>
        </div>

        <div className="event-detail-demo" aria-label="Temporary demonstration content">
          <div className="event-detail-demo-heading">
            <span>DEMO CONTENT</span>
            <span className="event-detail-demo-status">TEMPORARY / NO PROGRAMME DATA</span>
          </div>
          <div className="event-detail-demo-grid">
            <div className="event-detail-demo-item">
              <span className="event-detail-demo-label">MODE</span>
              <span className="event-detail-demo-value">{getVisualLabel(event.visualType)}</span>
            </div>
            <div className="event-detail-demo-item">
              <span className="event-detail-demo-label">SIGNAL</span>
              <span className="event-detail-demo-value">ACTIVE / {event.number}</span>
            </div>
            <div className="event-detail-demo-item">
              <span className="event-detail-demo-label">STATE</span>
              <span className="event-detail-demo-value">OPEN STUDY</span>
            </div>
          </div>
        </div>

        <p className="event-detail-hint">BACK TO EVENTS / PRESS ESC OR CLOSE</p>
      </div>
    </div>
  )
}

export default EventDetail
