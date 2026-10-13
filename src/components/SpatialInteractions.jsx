import { useEffect, useRef } from 'react'

const CURSOR_MODES = new Set(['default', 'hover', 'explore', 'close', 'navigate'])

const CURSOR_COPY = {
  default: { mark: '', label: '' },
  hover: { mark: '+', label: '' },
  explore: { mark: '↗', label: 'EXPLORE' },
  close: { mark: '×', label: 'CLOSE' },
  navigate: { mark: '→', label: 'GO' },
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

const normaliseMode = (value) => {
  if (value === 'scroll-nav' || value === 'scroll' || value === 'navigation') return 'navigate'
  return CURSOR_MODES.has(value) ? value : 'default'
}

const isPointerTargetEnabled = (element) => {
  if (!element || !element.isConnected) return false
  if (element.hasAttribute('disabled')) return false
  if (element.getAttribute('aria-disabled') === 'true') return false
  return true
}

const setExternalRef = (externalRef, value) => {
  if (typeof externalRef === 'function') {
    externalRef(value)
  } else if (externalRef && typeof externalRef === 'object') {
    externalRef.current = value
  }
}

/**
 * A single delegated desktop-pointer layer for Step 09.
 *
 * DOM controls opt in with:
 *   data-cursor="hover|explore|close|navigate"
 *   data-magnetic data-magnetic-strength="0.14" data-magnetic-max="6"
 *
 * Magnetic controls keep their hit box stationary and place all moving
 * content inside `.magnetic-visual`. WebGL targets can temporarily select a
 * cursor mode through `apiRef.current.setOverride(...)` without causing a
 * React render.
 */
function SpatialInteractionLayer({ apiRef }) {
  const cursorRef = useRef(null)
  const markRef = useRef(null)
  const labelRef = useRef(null)

  useEffect(() => {
    const cursor = cursorRef.current
    const mark = markRef.current
    const label = labelRef.current
    if (!cursor || !mark || !label) return undefined

    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const overrides = new Map()
    const magneticStates = new Map()

    let overrideSequence = 0
    let enabled = false
    let pointerVisible = false
    let pointerInitialised = false
    let pointerX = 0
    let pointerY = 0
    let cursorX = 0
    let cursorY = 0
    let activeCursorTarget = null
    let activeCursorAccent = ''
    let activeMagneticHost = null
    let activeMagneticState = null
    let frameId = null
    let previousFrameTime = 0

    const restoreMagneticState = (state) => {
      if (!state) return
      state.host?.removeAttribute('data-magnetic-active')
      if (!state.visual) return
      state.visual.style.removeProperty('--magnetic-x')
      state.visual.style.removeProperty('--magnetic-y')
      state.visual.style.removeProperty('will-change')
    }

    const resetMagnetics = () => {
      magneticStates.forEach(restoreMagneticState)
      magneticStates.clear()
      activeMagneticHost = null
      activeMagneticState = null
    }

    const getLatestOverride = () => {
      let latest = null
      overrides.forEach((override) => {
        if (!latest || override.sequence > latest.sequence) latest = override
      })
      return latest
    }

    const getTargetAccent = (target) => {
      if (!target) return ''
      const explicitAccent = target.getAttribute('data-cursor-accent')
      if (explicitAccent) return explicitAccent
      return window.getComputedStyle(target).getPropertyValue('--event-accent').trim()
    }

    const updateCursorPresentation = () => {
      const targetIsActive = isPointerTargetEnabled(activeCursorTarget)
      const override = getLatestOverride()
      const targetMode = targetIsActive
        ? normaliseMode(activeCursorTarget.getAttribute('data-cursor'))
        : null
      const mode = targetMode ?? override?.mode ?? 'default'
      const copy = CURSOR_COPY[mode]
      const targetLabel = targetIsActive
        ? activeCursorTarget.getAttribute('data-cursor-label')
        : null
      const cursorLabel = targetLabel ?? override?.label ?? copy.label
      const accent = (targetIsActive ? activeCursorAccent : '') || override?.accent || ''

      if (cursor.dataset.mode !== mode) cursor.dataset.mode = mode
      if (mark.textContent !== copy.mark) mark.textContent = copy.mark
      if (label.textContent !== cursorLabel) label.textContent = cursorLabel
      if (accent) {
        cursor.style.setProperty('--cursor-accent', accent)
      } else {
        cursor.style.removeProperty('--cursor-accent')
      }
    }

    const ensureFrame = () => {
      if (!enabled || frameId !== null) return
      previousFrameTime = performance.now()
      frameId = window.requestAnimationFrame(runFrame)
    }

    const releaseMagneticHost = () => {
      if (!activeMagneticState) return
      activeMagneticState.targetX = 0
      activeMagneticState.targetY = 0
      activeMagneticState.active = false
      activeMagneticState.host?.removeAttribute('data-magnetic-active')
      activeMagneticHost = null
      activeMagneticState = null
      ensureFrame()
    }

    const setMagneticHost = (host) => {
      if (host === activeMagneticHost && activeMagneticState?.visual?.isConnected) return
      releaseMagneticHost()
      if (!isPointerTargetEnabled(host)) return

      const visual = host.querySelector('.magnetic-visual')
      if (!visual) return
      let state = magneticStates.get(visual)
      if (!state) {
        state = {
          host,
          visual,
          rect: host.getBoundingClientRect(),
          x: 0,
          y: 0,
          targetX: 0,
          targetY: 0,
          active: true,
        }
        magneticStates.set(visual, state)
      } else {
        state.host = host
        state.rect = host.getBoundingClientRect()
        state.active = true
      }
      host.setAttribute('data-magnetic-active', 'true')
      visual.style.setProperty('will-change', 'transform')
      activeMagneticHost = host
      activeMagneticState = state
    }

    const updateMagneticTarget = () => {
      const state = activeMagneticState
      if (!state || !isPointerTargetEnabled(state.host) || !state.visual?.isConnected) {
        releaseMagneticHost()
        return
      }
      const strength = clamp(Number.parseFloat(state.host.dataset.magneticStrength) || 0.14, 0, 0.35)
      const maximum = clamp(Number.parseFloat(state.host.dataset.magneticMax) || 6, 0, 12)
      const centreX = state.rect.left + state.rect.width * 0.5
      const centreY = state.rect.top + state.rect.height * 0.5
      state.targetX = clamp((pointerX - centreX) * strength, -maximum, maximum)
      state.targetY = clamp((pointerY - centreY) * strength, -maximum, maximum)
    }

    const setTargetsFromElement = (element) => {
      const cursorTarget = element?.closest?.('[data-cursor]') ?? null
      const magneticHost = element?.closest?.('[data-magnetic]') ?? null
      const eligibleCursorTarget = isPointerTargetEnabled(cursorTarget) ? cursorTarget : null
      const eligibleMagneticHost = isPointerTargetEnabled(magneticHost) ? magneticHost : null

      if (eligibleCursorTarget !== activeCursorTarget) {
        activeCursorTarget = eligibleCursorTarget
        activeCursorAccent = getTargetAccent(activeCursorTarget)
      }
      setMagneticHost(eligibleMagneticHost)
      updateMagneticTarget()
      updateCursorPresentation()
    }

    const setTargetsFromPoint = () => {
      if (!enabled || !pointerInitialised) return
      const element = document.elementFromPoint(pointerX, pointerY)
      setTargetsFromElement(element instanceof Element ? element : null)
    }

    const hidePointer = () => {
      pointerVisible = false
      cursor.dataset.visible = 'false'
      activeCursorTarget = null
      activeCursorAccent = ''
      releaseMagneticHost()
      updateCursorPresentation()
    }

    function runFrame(time) {
      frameId = null
      if (!enabled) return

      const elapsedSeconds = clamp((time - previousFrameTime) / 1000, 0.001, 0.05)
      previousFrameTime = time
      const cursorBlend = 1 - Math.exp(-24 * elapsedSeconds)
      const magneticBlend = 1 - Math.exp(-18 * elapsedSeconds)
      let shouldContinue = false

      if (pointerInitialised) {
        cursorX += (pointerX - cursorX) * cursorBlend
        cursorY += (pointerY - cursorY) * cursorBlend
        cursor.style.setProperty('--cursor-x', `${cursorX.toFixed(2)}px`)
        cursor.style.setProperty('--cursor-y', `${cursorY.toFixed(2)}px`)
        shouldContinue = Math.abs(pointerX - cursorX) > 0.05 || Math.abs(pointerY - cursorY) > 0.05
      }

      magneticStates.forEach((state, visual) => {
        if (!visual.isConnected || !state.host?.isConnected) {
          restoreMagneticState(state)
          magneticStates.delete(visual)
          return
        }
        state.x += (state.targetX - state.x) * magneticBlend
        state.y += (state.targetY - state.y) * magneticBlend
        visual.style.setProperty('--magnetic-x', `${state.x.toFixed(2)}px`)
        visual.style.setProperty('--magnetic-y', `${state.y.toFixed(2)}px`)
        const isMoving = Math.abs(state.targetX - state.x) > 0.02
          || Math.abs(state.targetY - state.y) > 0.02
        if (!state.active && !isMoving && Math.abs(state.x) < 0.03 && Math.abs(state.y) < 0.03) {
          restoreMagneticState(state)
          magneticStates.delete(visual)
        } else {
          shouldContinue ||= isMoving
        }
      })

      if (shouldContinue) frameId = window.requestAnimationFrame(runFrame)
    }

    const handlePointerMove = (pointerEvent) => {
      if (!enabled || (pointerEvent.pointerType && pointerEvent.pointerType !== 'mouse')) return
      pointerX = pointerEvent.clientX
      pointerY = pointerEvent.clientY
      if (!pointerInitialised) {
        pointerInitialised = true
        cursorX = pointerX
        cursorY = pointerY
      }
      pointerVisible = true
      cursor.dataset.visible = 'true'
      setTargetsFromElement(pointerEvent.target instanceof Element ? pointerEvent.target : null)
      ensureFrame()
    }

    const handlePointerOut = (pointerEvent) => {
      if (pointerEvent.pointerType && pointerEvent.pointerType !== 'mouse') return
      if (pointerEvent.relatedTarget === null) hidePointer()
    }

    const handleViewportChange = () => {
      if (!enabled || !pointerVisible) return
      if (activeMagneticState) activeMagneticState.rect = activeMagneticState.host.getBoundingClientRect()
      setTargetsFromPoint()
      ensureFrame()
    }

    const resetInteraction = () => {
      hidePointer()
      pointerInitialised = false
      overrides.clear()
      resetMagnetics()
      updateCursorPresentation()
    }

    const updateCapability = () => {
      const nextEnabled = finePointerQuery.matches && !reducedMotionQuery.matches
      if (nextEnabled === enabled) return
      enabled = nextEnabled
      cursor.dataset.enabled = String(enabled)
      if (!enabled) {
        resetInteraction()
        if (frameId !== null) window.cancelAnimationFrame(frameId)
        frameId = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) resetInteraction()
    }

    const setOverride = (sourceOrOptions, modeValue, accentValue, labelValue) => {
      let source = sourceOrOptions
      let mode = modeValue
      let accent = accentValue
      let overrideLabel = labelValue

      if (sourceOrOptions && typeof sourceOrOptions === 'object') {
        source = sourceOrOptions.source
        mode = sourceOrOptions.mode
        accent = sourceOrOptions.accent
        overrideLabel = sourceOrOptions.label
      } else if (CURSOR_MODES.has(sourceOrOptions) && !CURSOR_MODES.has(modeValue)) {
        source = 'canvas'
        mode = sourceOrOptions
        accent = modeValue
        overrideLabel = accentValue
      }

      const key = typeof source === 'string' && source ? source : 'canvas'
      overrides.set(key, {
        mode: normaliseMode(mode),
        accent: typeof accent === 'string' ? accent : '',
        label: typeof overrideLabel === 'string' ? overrideLabel : null,
        sequence: ++overrideSequence,
      })
      updateCursorPresentation()
      ensureFrame()
    }

    const clearOverride = (source) => {
      if (typeof source === 'undefined') {
        overrides.clear()
      } else {
        overrides.delete(typeof source === 'object' ? source.source : source)
      }
      updateCursorPresentation()
      ensureFrame()
    }

    const interactionApi = { setOverride, clearOverride }
    setExternalRef(apiRef, interactionApi)

    cursor.dataset.enabled = 'false'
    cursor.dataset.visible = 'false'
    cursor.dataset.mode = 'default'
    finePointerQuery.addEventListener('change', updateCapability)
    reducedMotionQuery.addEventListener('change', updateCapability)
    document.addEventListener('pointermove', handlePointerMove, { passive: true, capture: true })
    document.addEventListener('pointerout', handlePointerOut, { passive: true, capture: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', resetInteraction)
    window.addEventListener('resize', handleViewportChange, { passive: true })
    window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true })
    updateCapability()

    return () => {
      finePointerQuery.removeEventListener('change', updateCapability)
      reducedMotionQuery.removeEventListener('change', updateCapability)
      document.removeEventListener('pointermove', handlePointerMove, true)
      document.removeEventListener('pointerout', handlePointerOut, true)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', resetInteraction)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      resetMagnetics()
      overrides.clear()
      cursor.style.removeProperty('--cursor-x')
      cursor.style.removeProperty('--cursor-y')
      cursor.style.removeProperty('--cursor-accent')
      if (
        (typeof apiRef === 'function')
        || (apiRef && typeof apiRef === 'object' && apiRef.current === interactionApi)
      ) {
        setExternalRef(apiRef, null)
      }
    }
  }, [apiRef])

  return (
    <div
      ref={cursorRef}
      className="spatial-cursor"
      data-enabled="false"
      data-visible="false"
      data-mode="default"
      aria-hidden="true"
    >
      <span className="spatial-cursor-ring" />
      <span ref={markRef} className="spatial-cursor-mark" />
      <span ref={labelRef} className="spatial-cursor-label" />
    </div>
  )
}

export default SpatialInteractionLayer
export { SpatialInteractionLayer }
