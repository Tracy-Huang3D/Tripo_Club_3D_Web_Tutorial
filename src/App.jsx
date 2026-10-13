import HeroUI from './components/HeroUI'
import Environment from './components/Environment'
import EventDetail from './components/EventDetail'
import Scene from './components/Scene'
import SpatialInteractionLayer from './components/SpatialInteractions'
import SpatialNavigation from './components/SpatialNavigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EVENT_CONFIG, EVENT_COUNT, getEventIndex, getInterpolatedAccent } from './data/events'

const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value))

const smoothstep = (edge0, edge1, value) => {
  const amount = clamp((value - edge0) / Math.max(edge1 - edge0, 0.0001))
  return amount * amount * (3 - 2 * amount)
}

// Keep the physical Hero and carousel travel from Steps 01–07 while reserving
// an independent range for the next architectural space. With an 800svh
// shell, these ranges are approximately 140vh for the Hero, 112vh between
// event stops, and 168vh for the section stack.
const HERO_END = 0.20
const CAROUSEL_START = HERO_END
const CAROUSEL_END = 0.68
const SECTION_END = 0.92
const CAROUSEL_STOPS = EVENT_COUNT
const EXPANSION_DURATION = 920
const COLLAPSE_DURATION = 760
const NAVIGATION_TARGETS = {
  home: 0,
  events: CAROUSEL_START,
  club: SECTION_END,
}
const SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'PageDown',
  'PageUp',
  'Home',
  'End',
  ' ',
  'Spacebar',
])

function App() {
  const shellRef = useRef(null)
  const heroRef = useRef(null)
  const scrollRef = useRef({
    progress: 0,
    rawProgress: 0,
    target: 0,
    carouselProgress: 0,
    sectionProgress: 0,
  })
  const expansionRef = useRef({ phase: 'carousel', progress: 0, selectedIndex: null, locked: false })
  const expansionFrameRef = useRef(null)
  const savedScrollRef = useRef(null)
  const cancelSnapRef = useRef(null)
  const openerRef = useRef(null)
  const menuTriggerRef = useRef(null)
  const navigationTriggerRef = useRef(null)
  const menuOpenRef = useRef(false)
  const interactionApiRef = useRef(null)
  const pendingNavigationRef = useRef(null)
  const performNavigationRef = useRef(null)
  const suppressDetailFocusRestoreRef = useRef(false)
  const currentSectionRef = useRef('home')
  const navigationRef = useRef({
    inFlight: false,
    targetY: 0,
    frameId: null,
    deadline: 0,
  })
  const [transition, setTransition] = useState({ phase: 'carousel', progress: 0, selectedIndex: null })
  const [reducedMotion, setReducedMotion] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentSection, setCurrentSection] = useState('home')
  const [navigationStatus, setNavigationStatus] = useState('')
  const pointerRef = useRef({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    velocityX: 0,
    velocityY: 0,
    isActive: false,
  })

  const setExpansionState = useCallback((phase, progress, selectedIndex = expansionRef.current.selectedIndex) => {
    expansionRef.current.phase = phase
    expansionRef.current.progress = progress
    expansionRef.current.selectedIndex = selectedIndex
    expansionRef.current.locked = phase !== 'carousel'
    setTransition({ phase, progress, selectedIndex })
  }, [])

  const lockScroll = useCallback((owner = 'detail') => {
    if (savedScrollRef.current) return
    const body = document.body
    const scrollY = window.scrollY
    savedScrollRef.current = {
      owner,
      scrollY,
      scrollState: { ...scrollRef.current },
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    body.style.overflow = 'hidden'
  }, [])

  const unlockScroll = useCallback((owner = null) => {
    const saved = savedScrollRef.current
    if (!saved) return
    if (owner && saved.owner !== owner) return
    const body = document.body
    body.style.position = saved.position
    body.style.top = saved.top
    body.style.width = saved.width
    body.style.overflow = saved.overflow
    Object.assign(scrollRef.current, saved.scrollState)
    window.scrollTo({ top: saved.scrollY, behavior: 'auto' })
    savedScrollRef.current = null
  }, [])

  const runExpansion = useCallback((from, to, duration, phase, onComplete) => {
    if (expansionFrameRef.current) window.cancelAnimationFrame(expansionFrameRef.current)
    const startedAt = performance.now()
    const selectedIndex = expansionRef.current.selectedIndex
    const tick = (time) => {
      const linear = clamp((time - startedAt) / Math.max(duration, 1))
      const eased = linear * linear * (3 - 2 * linear)
      const progress = from + (to - from) * eased
      expansionRef.current.progress = progress
      setTransition({ phase, progress, selectedIndex })
      if (linear < 1) {
        expansionFrameRef.current = window.requestAnimationFrame(tick)
      } else {
        expansionFrameRef.current = null
        onComplete?.()
      }
    }
    expansionFrameRef.current = window.requestAnimationFrame(tick)
  }, [])

  const openEvent = useCallback((requestedIndex, opener = null) => {
    if (expansionRef.current.phase !== 'carousel') return
    if (menuOpenRef.current) return
    // Event 04 remains available right at the hand-off, but event hit targets
    // must stop accepting input once the Club architecture takes over.
    if ((scrollRef.current.sectionProgress ?? 0) >= 0.10) return
    const selectedIndex = Number.isInteger(requestedIndex)
      ? Math.min(EVENT_COUNT - 1, Math.max(0, requestedIndex))
      : getEventIndex(scrollRef.current.carouselProgress)
    const activeElement = document.activeElement
    openerRef.current = opener && typeof opener.focus === 'function'
      ? opener
      : activeElement && activeElement !== document.body && typeof activeElement.focus === 'function'
        ? activeElement
        : null
    suppressDetailFocusRestoreRef.current = false
    setExpansionState('expanding', 0, selectedIndex)
    cancelSnapRef.current?.()
    lockScroll('detail')
    if (reducedMotion) {
      setExpansionState('expanded', 1, selectedIndex)
      return
    }
    runExpansion(0, 1, EXPANSION_DURATION, 'expanding', () => {
      setExpansionState('expanded', 1, selectedIndex)
    })
  }, [lockScroll, reducedMotion, runExpansion, setExpansionState])

  const closeEvent = useCallback(() => {
    const current = expansionRef.current
    if (current.phase !== 'expanded' && current.phase !== 'expanding') return
    const selectedIndex = current.selectedIndex
    const from = current.progress
    setExpansionState('collapsing', from, selectedIndex)
    const finish = () => {
      setExpansionState('carousel', 0, null)
      unlockScroll('detail')
      const pendingDestination = pendingNavigationRef.current
      pendingNavigationRef.current = null
      if (pendingDestination) {
        window.requestAnimationFrame(() => {
          performNavigationRef.current?.(pendingDestination)
        })
      } else {
        suppressDetailFocusRestoreRef.current = false
      }
    }
    if (reducedMotion) {
      finish()
      return
    }
    runExpansion(from, 0, Math.max(260, COLLAPSE_DURATION * from), 'collapsing', finish)
  }, [reducedMotion, runExpansion, setExpansionState, unlockScroll])

  const requestEventClose = useCallback(() => {
    pendingNavigationRef.current = null
    suppressDetailFocusRestoreRef.current = false
    closeEvent()
  }, [closeEvent])

  const cancelProgrammaticNavigation = useCallback(() => {
    const navigation = navigationRef.current
    const wasInFlight = navigation.inFlight
    navigation.inFlight = false
    if (navigation.frameId !== null) {
      window.cancelAnimationFrame(navigation.frameId)
      navigation.frameId = null
    }
    if (wasInFlight) {
      const currentScrollY = window.scrollY
      window.scrollTo({ top: currentScrollY, behavior: 'auto' })
    }
  }, [])

  const performNavigation = useCallback((destination) => {
    const targetProgress = NAVIGATION_TARGETS[destination]
    const shell = shellRef.current
    if (!shell || !Number.isFinite(targetProgress)) return

    cancelProgrammaticNavigation()
    cancelSnapRef.current?.()

    const scrollRange = Math.max(shell.offsetHeight - window.innerHeight, 1)
    const shellTop = shell.getBoundingClientRect().top + window.scrollY
    const targetY = shellTop + targetProgress * scrollRange
    const navigation = navigationRef.current
    navigation.inFlight = true
    navigation.targetY = targetY
    navigation.deadline = performance.now() + (reducedMotion ? 250 : 5000)

    const finishNavigation = () => {
      cancelProgrammaticNavigation()
      suppressDetailFocusRestoreRef.current = false
      const label = destination === 'home'
        ? 'Home'
        : destination === 'events'
          ? 'Event Space'
          : 'Club Experience'
      setNavigationStatus(`${label} reached`)
      window.requestAnimationFrame(() => {
        const focusTarget = destination === 'home'
          ? document.getElementById('home-heading')
          : destination === 'events'
            ? document.getElementById('event-space-heading')
            : document.getElementById('club-experience-title')
        focusTarget?.focus({ preventScroll: true })
      })
    }

    const watchNavigation = () => {
      if (!navigationRef.current.inFlight) return
      const distance = Math.abs(window.scrollY - navigationRef.current.targetY)
      if (distance <= 2 || performance.now() >= navigationRef.current.deadline) {
        finishNavigation()
        return
      }
      navigationRef.current.frameId = window.requestAnimationFrame(watchNavigation)
    }

    window.scrollTo({
      top: targetY,
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    scrollRef.current.target = targetProgress
    navigation.frameId = window.requestAnimationFrame(watchNavigation)
  }, [cancelProgrammaticNavigation, reducedMotion])

  performNavigationRef.current = performNavigation

  const closeMenu = useCallback(() => {
    if (!menuOpenRef.current) return
    menuOpenRef.current = false
    setMenuOpen(false)
    if (savedScrollRef.current?.owner === 'menu') unlockScroll('menu')
    if (expansionRef.current.phase !== 'carousel') {
      window.requestAnimationFrame(() => {
        suppressDetailFocusRestoreRef.current = false
        navigationTriggerRef.current?.focus?.({ preventScroll: true })
      })
    }
  }, [unlockScroll])

  const openMenu = useCallback((trigger = null) => {
    const phase = expansionRef.current.phase
    if (menuOpenRef.current || (phase !== 'carousel' && phase !== 'expanded')) return
    cancelProgrammaticNavigation()
    cancelSnapRef.current?.()
    interactionApiRef.current?.clearOverride?.('active-event')
    navigationTriggerRef.current = trigger?.currentTarget && typeof trigger.currentTarget.focus === 'function'
      ? trigger.currentTarget
      : trigger && typeof trigger.focus === 'function'
        ? trigger
        : menuTriggerRef.current
    if (phase !== 'carousel') suppressDetailFocusRestoreRef.current = true
    menuOpenRef.current = true
    setMenuOpen(true)
    if (phase === 'carousel') lockScroll('menu')
  }, [cancelProgrammaticNavigation, lockScroll])

  const navigateToScene = useCallback((destination) => {
    if (!Object.prototype.hasOwnProperty.call(NAVIGATION_TARGETS, destination)) return

    if (expansionRef.current.phase !== 'carousel') {
      if (menuOpenRef.current) {
        menuOpenRef.current = false
        setMenuOpen(false)
      }
      pendingNavigationRef.current = destination
      suppressDetailFocusRestoreRef.current = true
      closeEvent()
      return
    }

    if (menuOpenRef.current) {
      menuOpenRef.current = false
      setMenuOpen(false)
      const menuOwnsScrollLock = savedScrollRef.current?.owner === 'menu'
      if (menuOwnsScrollLock) unlockScroll('menu')
      window.requestAnimationFrame(() => {
        if (menuOwnsScrollLock) {
          performNavigationRef.current?.(destination)
        } else {
          navigateToScene(destination)
        }
      })
      return
    }

    performNavigation(destination)
  }, [closeEvent, performNavigation, unlockScroll])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => () => {
    if (expansionFrameRef.current) window.cancelAnimationFrame(expansionFrameRef.current)
    cancelProgrammaticNavigation()
    unlockScroll()
  }, [cancelProgrammaticNavigation, unlockScroll])

  useEffect(() => {
    const shell = shellRef.current
    const hero = heroRef.current
    if (!hero || !shell) return undefined

    let frameId
    let previousTime = performance.now()
    let snapTimer
    let snapFinishTimer
    let snapInFlight = false
    const eventCounter = hero.querySelector('.event-counter')
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    const getScrollMetrics = () => {
      const scrollRange = Math.max(shell.offsetHeight - window.innerHeight, 1)
      const shellTop = shell.getBoundingClientRect().top + window.scrollY
      const rawProgress = clamp((window.scrollY - shellTop) / scrollRange)
      return { rawProgress, scrollRange }
    }

    const updateScrollTarget = () => {
      if (expansionRef.current.locked || menuOpenRef.current) return
      scrollRef.current.target = getScrollMetrics().rawProgress
    }

    const finishSnap = () => {
      snapInFlight = false
      if (snapFinishTimer) window.clearTimeout(snapFinishTimer)
      snapFinishTimer = undefined
    }

    const isInsideCarouselSnapRange = (rawProgress) => (
      rawProgress >= CAROUSEL_START + 0.025 && rawProgress <= CAROUSEL_END
    )

    const cancelSnapOnInput = (event) => {
      if (expansionRef.current.locked || menuOpenRef.current) return
      if (event?.type === 'keydown' && !SCROLL_KEYS.has(event.key)) return
      if (navigationRef.current.inFlight) cancelProgrammaticNavigation()
      if (snapTimer) {
        window.clearTimeout(snapTimer)
        snapTimer = undefined
      }
      if (snapInFlight) {
        const currentScrollY = window.scrollY
        window.scrollTo({ top: currentScrollY, behavior: 'auto' })
        finishSnap()
      }
      if (!isInsideCarouselSnapRange(getScrollMetrics().rawProgress)) return
      // Input listeners fire before the subsequent scroll event. Re-arm the
      // debounce after that event so wheel/touch/key scrolling still settles
      // on an event stop without ever scheduling a Club endpoint.
      scheduleSnap()
    }

    const cancelPendingSnap = () => {
      if (snapTimer) {
        window.clearTimeout(snapTimer)
        snapTimer = undefined
      }
      if (snapInFlight) {
        const currentScrollY = window.scrollY
        window.scrollTo({ top: currentScrollY, behavior: 'auto' })
      }
      finishSnap()
    }

    cancelSnapRef.current = cancelPendingSnap

    const scheduleSnap = () => {
      if (expansionRef.current.locked || menuOpenRef.current) return
      if (navigationRef.current.inFlight) return
      if (snapInFlight) return
      if (snapTimer) window.clearTimeout(snapTimer)
      const scheduledProgress = getScrollMetrics().rawProgress
      if (!isInsideCarouselSnapRange(scheduledProgress)) {
        snapTimer = undefined
        return
      }
      snapTimer = window.setTimeout(() => {
        snapTimer = undefined
        if (expansionRef.current.locked) return
        const { rawProgress, scrollRange } = getScrollMetrics()
        // Snapping belongs exclusively to the four-event range. In
        // particular, never pull a user who has left Event 04 back from the
        // section-stacking timeline.
        if (!isInsideCarouselSnapRange(rawProgress)) return

        const carouselProgress = clamp(
          (rawProgress - CAROUSEL_START) / (CAROUSEL_END - CAROUSEL_START),
        )
        const nearestStop = Math.round(carouselProgress * (CAROUSEL_STOPS - 1))
        const targetRawProgress = CAROUSEL_START
          + (nearestStop / (CAROUSEL_STOPS - 1)) * (CAROUSEL_END - CAROUSEL_START)
        const shellTop = shell.getBoundingClientRect().top + window.scrollY
        const targetScrollY = shellTop + targetRawProgress * scrollRange
        if (Math.abs(window.scrollY - targetScrollY) < 6) return

        snapInFlight = true
        window.scrollTo({
          top: targetScrollY,
          behavior: reducedMotionQuery.matches ? 'auto' : 'smooth',
        })
        snapFinishTimer = window.setTimeout(finishSnap, reducedMotionQuery.matches ? 90 : 850)
      }, 190)
    }

    const handleScroll = () => {
      if (expansionRef.current.locked) return
      updateScrollTarget()
      scheduleSnap()
    }

    const resetTarget = () => {
      pointerRef.current.targetX = 0
      pointerRef.current.targetY = 0
      pointerRef.current.isActive = false
    }

    const handlePointerMove = (event) => {
      const bounds = hero.getBoundingClientRect()
      const normalizedX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      const normalizedY = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1)
      pointerRef.current.targetX = Math.max(-1, Math.min(1, normalizedX))
      pointerRef.current.targetY = Math.max(-1, Math.min(1, normalizedY))
      pointerRef.current.isActive = true
    }

    const handlePointerDown = (event) => {
      if (event.pointerType === 'touch') handlePointerMove(event)
    }

    const handlePointerEnd = (event) => {
      if (event.pointerType === 'touch') resetTarget()
    }

    const updatePointer = (time) => {
      const input = pointerRef.current
      const elapsed = Math.max(1, time - previousTime)
      previousTime = time
      const smoothing = 1 - Math.pow(0.001, elapsed / 1000)
      const previousX = input.x
      const previousY = input.y
      input.x += (input.targetX - input.x) * smoothing
      input.y += (input.targetY - input.y) * smoothing
      input.velocityX = ((input.x - previousX) / elapsed) * 1000
      input.velocityY = ((input.y - previousY) / elapsed) * 1000

      const scrollState = scrollRef.current
      if (!Number.isFinite(scrollState.rawProgress)) scrollState.rawProgress = 0
      if (!Number.isFinite(scrollState.target)) scrollState.target = 0
      if (!expansionRef.current.locked) {
        const scrollSmoothing = 1 - Math.pow(0.0001, elapsed / 1000)
        scrollState.rawProgress += (scrollState.target - scrollState.rawProgress) * scrollSmoothing
        if (Math.abs(scrollState.target - scrollState.rawProgress) < 0.0001) {
          scrollState.rawProgress = scrollState.target
        }
      }

      const rawProgress = clamp(scrollState.rawProgress)
      const scrollProgress = clamp(rawProgress / HERO_END)
      const carouselProgress = clamp(
        (rawProgress - CAROUSEL_START) / (CAROUSEL_END - CAROUSEL_START),
      )
      const sectionProgress = clamp(
        (rawProgress - CAROUSEL_END) / (SECTION_END - CAROUSEL_END),
      )
      scrollState.progress = scrollProgress
      scrollState.carouselProgress = carouselProgress
      scrollState.sectionProgress = sectionProgress
      const nextSection = rawProgress < CAROUSEL_START - 0.012
        ? 'home'
        : sectionProgress >= 0.68
          ? 'club'
          : 'events'
      if (nextSection !== currentSectionRef.current) {
        currentSectionRef.current = nextSection
        setCurrentSection(nextSection)
      }
      const pointerInfluence = 1 - smoothstep(0.02, 0.78, scrollProgress)
      const spatialX = input.x * pointerInfluence
      const spatialY = input.y * pointerInfluence

      hero.style.setProperty('--parallax-x', `${(spatialX * 12).toFixed(3)}px`)
      hero.style.setProperty('--parallax-y', `${(spatialY * 9).toFixed(3)}px`)
      hero.style.setProperty('--hero-shift-x', `${(spatialX * 14).toFixed(3)}px`)
      hero.style.setProperty('--hero-shift-y', `${(spatialY * 8).toFixed(3)}px`)
      hero.style.setProperty('--hero-rotate-x', `${(-spatialY * 1.45).toFixed(3)}deg`)
      hero.style.setProperty('--hero-rotate-y', `${(spatialX * 2.25).toFixed(3)}deg`)
      hero.style.setProperty('--pointer-x', spatialX.toFixed(4))
      hero.style.setProperty('--pointer-y', spatialY.toFixed(4))
      hero.style.setProperty('--pointer-speed', (Math.min(1, Math.hypot(input.velocityX, input.velocityY) / 2.8) * pointerInfluence).toFixed(3))

      hero.style.setProperty('--scroll-progress', scrollProgress.toFixed(4))
      hero.style.setProperty('--carousel-progress', carouselProgress.toFixed(4))
      hero.style.setProperty('--section-progress', sectionProgress.toFixed(4))
      const eventSectionOpacity = 1 - smoothstep(0.10, 0.74, sectionProgress)
      const clubLayerOpacity = smoothstep(0.50, 0.82, sectionProgress)
      hero.style.setProperty('--event-section-opacity', eventSectionOpacity.toFixed(4))
      hero.style.setProperty('--club-layer-opacity', clubLayerOpacity.toFixed(4))
      const counterOpacity = (scrollProgress > 0.97 ? Math.max(0.22, carouselProgress) : carouselProgress)
        * eventSectionOpacity
      hero.style.setProperty('--carousel-counter-opacity', counterOpacity.toFixed(4))
      const eventLayerOpacity = smoothstep(0.92, 1, scrollProgress) * 0.86 * eventSectionOpacity
      hero.style.setProperty('--event-layer-opacity', eventLayerOpacity.toFixed(4))
      const eventAccentStrength = smoothstep(0.72, 1, scrollProgress) * 0.72
        * eventSectionOpacity
      hero.style.setProperty('--event-accent-strength', eventAccentStrength.toFixed(4))
      hero.style.setProperty('--event-accent', getInterpolatedAccent(carouselProgress))
      hero.style.setProperty('--pointer-influence', pointerInfluence.toFixed(4))
      hero.style.setProperty('--scroll-hero-scale', (1 - scrollProgress * 0.74).toFixed(4))
      hero.style.setProperty('--scroll-hero-y', `${(-scrollProgress * 13).toFixed(3)}vh`)
      hero.style.setProperty('--scroll-hero-rotate-x', `${(scrollProgress * 12).toFixed(3)}deg`)
      hero.style.setProperty('--scroll-hero-rotate-y', `${(-scrollProgress * 8).toFixed(3)}deg`)
      hero.style.setProperty('--scroll-hero-opacity', (scrollProgress * 0.48).toFixed(4))
      hero.style.setProperty('--scroll-hero-blur', (scrollProgress * 1.6).toFixed(3))
      hero.style.setProperty('--scroll-canvas-scale', (scrollProgress * 0.14).toFixed(4))
      hero.style.setProperty('--scroll-canvas-y', `${(scrollProgress * 5.5).toFixed(3)}vh`)
      hero.style.setProperty('--scroll-env-scale', (1 + scrollProgress * 0.16).toFixed(4))
      hero.style.setProperty('--scroll-env-y', `${(-scrollProgress * 4).toFixed(3)}vh`)
      hero.style.setProperty('--scroll-env-opacity', (1 - scrollProgress * 0.7).toFixed(4))
      hero.style.setProperty('--scroll-grid-scale', (scrollProgress * 0.22).toFixed(4))
      hero.style.setProperty('--scroll-grid-y', `${(scrollProgress * 8).toFixed(3)}%`)
      hero.style.setProperty('--scroll-grid-opacity', (scrollProgress * 0.14).toFixed(4))
      if (eventCounter) {
        const activeEvent = Math.min(CAROUSEL_STOPS - 1, Math.max(0, Math.round(carouselProgress * (CAROUSEL_STOPS - 1))))
        const counterText = `${String(activeEvent + 1).padStart(2, '0')} / ${String(EVENT_COUNT).padStart(2, '0')}`
        if (eventCounter.textContent !== counterText) eventCounter.textContent = counterText
        eventCounter.setAttribute('aria-label', `Event ${activeEvent + 1} of ${EVENT_COUNT}`)
      }
      frameId = requestAnimationFrame(updatePointer)
    }

    updateScrollTarget()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('scrollend', finishSnap, { passive: true })
    window.addEventListener('wheel', cancelSnapOnInput, { passive: true })
    window.addEventListener('touchstart', cancelSnapOnInput, { passive: true })
    window.addEventListener('keydown', cancelSnapOnInput, { passive: true })
    window.addEventListener('resize', updateScrollTarget, { passive: true })
    hero.addEventListener('pointermove', handlePointerMove, { passive: true })
    hero.addEventListener('pointerdown', handlePointerDown, { passive: true })
    hero.addEventListener('pointerup', handlePointerEnd, { passive: true })
    hero.addEventListener('pointercancel', handlePointerEnd, { passive: true })
    hero.addEventListener('pointerleave', resetTarget, { passive: true })
    frameId = requestAnimationFrame(updatePointer)

    return () => {
      hero.removeEventListener('pointermove', handlePointerMove)
      hero.removeEventListener('pointerdown', handlePointerDown)
      hero.removeEventListener('pointerup', handlePointerEnd)
      hero.removeEventListener('pointercancel', handlePointerEnd)
      hero.removeEventListener('pointerleave', resetTarget)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('scrollend', finishSnap)
      window.removeEventListener('wheel', cancelSnapOnInput)
      window.removeEventListener('touchstart', cancelSnapOnInput)
      window.removeEventListener('keydown', cancelSnapOnInput)
      window.removeEventListener('resize', updateScrollTarget)
      if (snapTimer) window.clearTimeout(snapTimer)
      if (snapFinishTimer) window.clearTimeout(snapFinishTimer)
      if (cancelSnapRef.current === cancelPendingSnap) cancelSnapRef.current = null
      cancelAnimationFrame(frameId)
    }
  }, [cancelProgrammaticNavigation])

  return (
    <>
      <main ref={shellRef} className="app-shell">
        <section
          ref={heroRef}
          className="hero"
          aria-label="Tripo Club immersive 3D space"
          aria-hidden={menuOpen || transition.phase !== 'carousel' ? true : undefined}
          inert={menuOpen || transition.phase !== 'carousel' ? '' : undefined}
        >
          <Scene
            pointerRef={pointerRef}
            scrollRef={scrollRef}
            expansionRef={expansionRef}
            onOpenEvent={openEvent}
            interactionApiRef={interactionApiRef}
          />
          <Environment />
          <HeroUI
            scrollRef={scrollRef}
            transitionPhase={transition.phase}
            onExplore={openEvent}
            onOpenMenu={openMenu}
            menuOpen={menuOpen}
            menuTriggerRef={menuTriggerRef}
          />
        </section>
        <SpatialNavigation
          open={menuOpen}
          onClose={closeMenu}
          onNavigate={navigateToScene}
          triggerRef={navigationTriggerRef}
          currentSection={currentSection}
          restoreFocus={!suppressDetailFocusRestoreRef.current}
        />
        {transition.selectedIndex !== null && (
          <EventDetail
            event={EVENT_CONFIG[transition.selectedIndex]}
            phase={transition.phase}
            progress={Math.max(0, (transition.progress - 0.58) / 0.42)}
            onRequestClose={requestEventClose}
            reducedMotion={reducedMotion}
            returnFocusTo={openerRef.current}
            suppressFocusRestoreRef={suppressDetailFocusRestoreRef}
            onOpenMenu={openMenu}
            navigationOpen={menuOpen}
          />
        )}
        <p className="sr-only" aria-live="polite" aria-atomic="true">{navigationStatus}</p>
      </main>
      <SpatialInteractionLayer apiRef={interactionApiRef} />
    </>
  )
}

export default App
