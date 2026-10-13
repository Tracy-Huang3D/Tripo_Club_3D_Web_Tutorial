import { useEffect, useId, useRef } from 'react'

const NAVIGATION_ITEMS = [
  { id: 'home', index: '01', label: 'HOME', description: 'RETURN TO THE HERO' },
  { id: 'events', index: '02', label: 'EVENTS', description: 'ENTER THE EVENT SPACE' },
  { id: 'club', index: '03', label: 'CLUB', description: 'EXPLORE THE CLUB' },
]

function SpatialNavigation({
  open = false,
  onClose,
  onNavigate,
  triggerRef,
  currentSection = 'home',
  restoreFocus = true,
}) {
  const dialogRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const currentSectionRef = useRef(currentSection)
  const titleId = useId()
  const hintId = useId()

  onCloseRef.current = onClose
  currentSectionRef.current = currentSection

  useEffect(() => {
    if (!open) return undefined

    const dialog = dialogRef.current
    const trigger = triggerRef?.current
    restoreFocusRef.current = trigger && document.contains(trigger)
      ? trigger
      : document.activeElement

    const getFocusableControls = () => (
      Array.from(dialog?.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
    )

    const focusFrame = window.requestAnimationFrame(() => {
      const initialSection = currentSectionRef.current
      const requestedControl = NAVIGATION_ITEMS.some((item) => item.id === initialSection)
        ? dialog?.querySelector(`[data-navigation-target="${initialSection}"]`)
        : null
      const firstControl = getFocusableControls()[0]
      ;(requestedControl || firstControl)?.focus({ preventScroll: true })
    })

    const handleKeyDown = (keyboardEvent) => {
      if (keyboardEvent.key === 'Escape') {
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        onCloseRef.current?.()
        return
      }

      if (keyboardEvent.key !== 'Tab') return

      const controls = getFocusableControls()
      if (controls.length === 0) {
        keyboardEvent.preventDefault()
        return
      }

      const firstControl = controls[0]
      const lastControl = controls[controls.length - 1]
      const activeElement = document.activeElement
      const focusIsOutside = !dialog?.contains(activeElement)

      if (keyboardEvent.shiftKey && (activeElement === firstControl || focusIsOutside)) {
        keyboardEvent.preventDefault()
        lastControl.focus({ preventScroll: true })
      } else if (!keyboardEvent.shiftKey && (activeElement === lastControl || focusIsOutside)) {
        keyboardEvent.preventDefault()
        firstControl.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown, true)
      const restoreTarget = restoreFocusRef.current
      if (
        restoreFocus
        &&
        restoreTarget
        && typeof restoreTarget.focus === 'function'
        && document.contains(restoreTarget)
      ) {
        restoreTarget.focus({ preventScroll: true })
      }
      restoreFocusRef.current = null
    }
  }, [open, restoreFocus, triggerRef])

  if (!open) return null

  return (
    <div
      id="spatial-navigation"
      ref={dialogRef}
      className="spatial-navigation is-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      data-state="open"
    >
      <div
        className="spatial-navigation-backdrop"
        aria-hidden="true"
        data-cursor="close"
        onClick={() => onClose?.()}
      />

      <div className="spatial-navigation-shell">
        <header className="spatial-navigation-header">
          <p id={titleId} className="spatial-navigation-title">
            <span aria-hidden="true">TRIPO CLUB / </span>
            SPATIAL NAVIGATION
          </p>
          <button
            className="spatial-navigation-close"
            type="button"
            onClick={() => onClose?.()}
            aria-label="Close spatial navigation"
            data-magnetic
            data-cursor="close"
          >
            <span className="magnetic-visual">
              <span aria-hidden="true">CLOSE</span>
              <span className="spatial-navigation-close-mark" aria-hidden="true">×</span>
            </span>
          </button>
        </header>

        <nav className="spatial-navigation-nav" aria-label="Navigate between Tripo Club spaces">
          <ol className="spatial-navigation-list">
            {NAVIGATION_ITEMS.map((item) => {
              const isCurrent = item.id === currentSection
              return (
                <li className="spatial-navigation-item" key={item.id}>
                  <button
                    className={`spatial-navigation-link${isCurrent ? ' is-current' : ''}`}
                    type="button"
                    onClick={() => onNavigate?.(item.id)}
                    aria-current={isCurrent ? 'location' : undefined}
                    data-navigation-target={item.id}
                    data-magnetic
                    data-cursor="navigate"
                  >
                    <span className="magnetic-visual">
                      <span className="spatial-navigation-index" aria-hidden="true">{item.index}</span>
                      <span className="spatial-navigation-label">{item.label}</span>
                      <span className="spatial-navigation-description" aria-hidden="true">{item.description}</span>
                      <span className="spatial-navigation-arrow" aria-hidden="true">↗</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <p id={hintId} className="spatial-navigation-hint">
          SELECT A SPACE <span aria-hidden="true">/</span> PRESS ESC TO CLOSE
        </p>
      </div>
    </div>
  )
}

export default SpatialNavigation
