import { useEffect, useRef, useState } from 'react'
import { EVENT_CONFIG, EVENT_COUNT, getEventIndex } from '../data/events'

/**
 * Small reusable editorial reveal. Keeping the source text in a visually
 * hidden node means the animated glyphs never become the accessible name.
 */
export function StaggeredText({ text, className = '', delay = 0 }) {
  return (
    <span className={`staggered-text ${className}`}>
      <span className="sr-only">{text}</span>
      <span className="staggered-text-visual" aria-hidden="true">
        {Array.from(text).map((character, index) => (
          <span
            className="staggered-character"
            key={`${character}-${index}`}
            style={{ '--character-delay': `${delay + index * 35}ms` }}
          >
            {character === ' ' ? '\u00a0' : character}
          </span>
        ))}
      </span>
    </span>
  )
}

function EventInfo({ event, eventIndex, isVisible, isAccessible, canExplore, onExplore }) {
  return (
    <section
      className={`event-info${isVisible ? ' is-visible' : ''}`}
      style={{ '--event-accent': event.accent }}
      aria-label={`${event.number} ${event.title}, ${event.subtitle}`}
      aria-live="polite"
      aria-hidden={!isAccessible}
    >
      <div className="event-info-inner" key={event.id}>
        <p className="event-info-meta">
          <span className="event-info-number">{event.number}</span>
          <span className="event-info-rule" aria-hidden="true" />
          <StaggeredText text={event.subtitle} delay={90} />
        </p>
        <h2 className="event-info-title">
          <StaggeredText text={event.title} delay={20} />
        </h2>
        <p className="event-info-description">
          <StaggeredText text={event.description} delay={160} />
        </p>
        <p className="event-info-type">{event.visualType} / spatial study</p>
        <button
          className="event-explore"
          type="button"
          onClick={(pointerEvent) => onExplore?.(eventIndex, pointerEvent.currentTarget)}
          disabled={!canExplore}
          tabIndex={canExplore ? undefined : -1}
          aria-label={`Explore ${event.title} fullscreen event detail`}
          data-magnetic
          data-magnetic-strength="0.13"
          data-magnetic-max="6"
          data-cursor="explore"
          data-cursor-accent={event.accent}
        >
          <span className="magnetic-visual interaction-label">
            <span>EXPLORE</span>
            <span className="event-explore-arrow" aria-hidden="true">↗</span>
          </span>
        </button>
      </div>
    </section>
  )
}

function InstallationCaption({ isVisible, isAccessible }) {
  return (
    <p
      className={`environment-caption${isVisible ? ' is-visible' : ''}`}
      aria-label="注意错峰入场"
      aria-hidden={!isAccessible}
    >
      <span className="environment-caption-label" aria-hidden="true">
        {Array.from('注意错峰入场').map((character, index) => (
          <span
            className="staggered-character"
            key={`${character}-${index}`}
            style={{ '--character-delay': `${index * 55 + 120}ms` }}
          >
            {character}
          </span>
        ))}
      </span>
      <span className="environment-caption-sub" aria-hidden="true">INSTALLATION NOTE / SAMPLE COPY</span>
    </p>
  )
}

function ClubExperienceCopy({ isVisible }) {
  return (
    <section
      className={`club-experience-copy${isVisible ? ' is-visible' : ''}`}
      aria-labelledby="club-experience-title"
      aria-hidden={!isVisible}
    >
      <p className="club-experience-eyebrow">
        <span className="club-experience-coordinate" aria-hidden="true">03 / SPATIAL LAYER</span>
        <StaggeredText text="TRIPO CLUB" delay={30} />
      </p>
      <h2
        id="club-experience-title"
        className="club-experience-title"
        aria-label="Create. Play. Connect."
        tabIndex="-1"
      >
        <span className="club-experience-title-line">
          <StaggeredText text="CREATE." delay={80} />
        </span>
        <span className="club-experience-title-line club-experience-title-line--offset">
          <StaggeredText text="PLAY." delay={150} />
        </span>
        <span className="club-experience-title-line">
          <StaggeredText text="CONNECT." delay={210} />
        </span>
      </h2>
      <p className="club-experience-statement">
        <StaggeredText text="A SPACE FOR DIGITAL CREATORS." delay={330} />
      </p>
    </section>
  )
}

function HeroUI({
  scrollRef,
  transitionPhase = 'carousel',
  onExplore,
  onOpenMenu,
  menuOpen = false,
  menuTriggerRef,
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [eventsEntered, setEventsEntered] = useState(false)
  const [sectionStage, setSectionStage] = useState('events')
  const [clubCopyVisible, setClubCopyVisible] = useState(false)
  const [eventUiAccessible, setEventUiAccessible] = useState(true)
  const [eventExploreEnabled, setEventExploreEnabled] = useState(true)
  const [eventSettled, setEventSettled] = useState(false)
  const activeIndexRef = useRef(0)
  const eventsEnteredRef = useRef(false)
  const sectionStageRef = useRef('events')
  const clubCopyVisibleRef = useRef(false)
  const eventUiAccessibleRef = useRef(true)
  const eventExploreEnabledRef = useRef(true)
  const eventSettledRef = useRef(false)
  const previousCarouselRef = useRef(0)
  const stableFrameCountRef = useRef(0)

  // Scroll remains the source of truth. State only changes at a discrete
  // event boundary, so oscillation around a snap point cannot flicker text.
  useEffect(() => {
    let frameId
    const readActiveEvent = () => {
      const carouselProgress = scrollRef?.current?.carouselProgress ?? 0
      const scrollProgress = scrollRef?.current?.progress ?? 0
      const sectionProgress = scrollRef?.current?.sectionProgress ?? 0
      const candidateIndex = getEventIndex(carouselProgress)
      const currentIndex = activeIndexRef.current
      const direction = Math.sign(candidateIndex - currentIndex)
      const eventSpacing = 1 / Math.max(EVENT_CONFIG.length - 1, 1)
      const hysteresis = 0.025
      const boundary = (currentIndex + direction * 0.5) * eventSpacing
      const crossedBoundary = direction > 0
        ? carouselProgress >= boundary + hysteresis
        : direction < 0
          ? carouselProgress <= boundary - hysteresis
          : false
      const nextIndex = direction === 0 || crossedBoundary ? candidateIndex : currentIndex
      if (nextIndex !== activeIndexRef.current) {
        activeIndexRef.current = nextIndex
        setActiveIndex(nextIndex)
      }
      const shouldShowEvents = scrollProgress > 0.94
      if (shouldShowEvents !== eventsEnteredRef.current) {
        eventsEnteredRef.current = shouldShowEvents
        setEventsEntered(shouldShowEvents)
      }

      // These thresholds update semantic/UI state only. The continuous visual
      // blend remains driven by CSS custom properties written by App's RAF.
      const nextSectionStage = sectionProgress >= 0.68
        ? 'club'
        : sectionProgress >= 0.42
          ? 'transition'
          : 'events'
      if (nextSectionStage !== sectionStageRef.current) {
        sectionStageRef.current = nextSectionStage
        setSectionStage(nextSectionStage)
      }

      const shouldRevealClubCopy = sectionProgress >= 0.50
      if (shouldRevealClubCopy !== clubCopyVisibleRef.current) {
        clubCopyVisibleRef.current = shouldRevealClubCopy
        setClubCopyVisible(shouldRevealClubCopy)
      }

      const shouldExposeEventUi = sectionProgress < 0.68
      if (shouldExposeEventUi !== eventUiAccessibleRef.current) {
        eventUiAccessibleRef.current = shouldExposeEventUi
        setEventUiAccessible(shouldExposeEventUi)
      }

      const shouldEnableEventExplore = sectionProgress < 0.10
      if (shouldEnableEventExplore !== eventExploreEnabledRef.current) {
        eventExploreEnabledRef.current = shouldEnableEventExplore
        setEventExploreEnabled(shouldEnableEventExplore)
      }

      const scaledProgress = carouselProgress * Math.max(EVENT_CONFIG.length - 1, 1)
      const distanceFromStop = Math.abs(scaledProgress - Math.round(scaledProgress))
      const frameMovement = Math.abs(carouselProgress - previousCarouselRef.current)
      previousCarouselRef.current = carouselProgress
      const stableCandidate = (
        shouldShowEvents
        && shouldEnableEventExplore
        && transitionPhase === 'carousel'
        && distanceFromStop <= 0.045
        && frameMovement <= 0.0009
      )
      stableFrameCountRef.current = stableCandidate
        ? Math.min(stableFrameCountRef.current + 1, 12)
        : 0
      const shouldShowActiveHint = stableFrameCountRef.current >= 5
      if (shouldShowActiveHint !== eventSettledRef.current) {
        eventSettledRef.current = shouldShowActiveHint
        setEventSettled(shouldShowActiveHint)
      }
      frameId = window.requestAnimationFrame(readActiveEvent)
    }
    frameId = window.requestAnimationFrame(readActiveEvent)
    return () => window.cancelAnimationFrame(frameId)
  }, [scrollRef, transitionPhase])

  const activeEvent = EVENT_CONFIG[activeIndex]
  const canExplore = eventsEntered
    && transitionPhase === 'carousel'
    && eventExploreEnabled
  const eventPrompt = eventSettled && canExplore
    ? 'CLICK TO EXPLORE'
    : 'SCROLL TO EXPLORE'
  const scrollPrompt = !eventsEntered
    ? 'SCROLL TO ENTER'
    : sectionStage === 'club'
      ? 'EXPLORE THE CLUB'
      : sectionStage === 'transition'
        ? 'EXPLORE THE CLUB'
        : eventPrompt
  const pageNumber = !eventsEntered ? 1 : sectionStage === 'club' ? 3 : 2

  return (
    <div className="ui-layer">
      <header className="hero-header">
        <p className="wordmark" aria-hidden="true">TRIPO CLUB</p>
        <button
          ref={menuTriggerRef}
          className="menu-trigger"
          type="button"
          aria-label="Open spatial navigation"
          aria-expanded={menuOpen}
          aria-controls="spatial-navigation"
          onClick={onOpenMenu}
          data-magnetic
          data-magnetic-strength="0.12"
          data-magnetic-max="5"
          data-cursor="hover"
        >
          <span className="magnetic-visual interaction-label">MENU</span>
        </button>
      </header>

      <h1 id="home-heading" className="sr-only" tabIndex="-1">TRIPO CLUB</h1>
      <div className="hero-center">
        <p className="hero-kicker">IMMERSIVE 3D SPACE</p>
      </div>

      <EventInfo
        event={activeEvent}
        eventIndex={activeIndex}
        isVisible={eventsEntered}
        isAccessible={eventsEntered && eventUiAccessible}
        canExplore={canExplore}
        onExplore={onExplore}
      />
      <h2 id="event-space-heading" className="sr-only" tabIndex="-1">Tripo Club Event Space</h2>
      <InstallationCaption
        isVisible={eventsEntered}
        isAccessible={eventsEntered && eventUiAccessible}
      />
      <ClubExperienceCopy isVisible={clubCopyVisible} />

      <footer className="hero-footer">
        <p className="scroll-cue" aria-label={scrollPrompt}>
          <span className="scroll-arrow" aria-hidden="true">↓</span>
          <span className="scroll-cue-label scroll-cue-label--hero" aria-hidden="true">SCROLL TO ENTER</span>
          <span className="scroll-cue-label scroll-cue-label--events" aria-hidden="true">{eventPrompt}</span>
          <span className="scroll-cue-label scroll-cue-label--transition" aria-hidden="true">EXPLORE THE CLUB</span>
          <span className="scroll-cue-label scroll-cue-label--club" aria-hidden="true">EXPLORE THE CLUB</span>
        </p>
        <p className="page-index" aria-label={`Page ${pageNumber} of 5`}>
          <span className="page-index-value page-index-value--hero" aria-hidden="true">01</span>
          <span className="page-index-value page-index-value--events" aria-hidden="true">02</span>
          <span className="page-index-value page-index-value--club" aria-hidden="true">03</span>
          <span>/</span> 05
        </p>
      </footer>
      <p
        className="event-counter"
        aria-label={`Event ${activeIndex + 1} of ${EVENT_COUNT}`}
        aria-hidden={!eventsEntered || sectionStage !== 'events'}
      >
        {String(activeIndex + 1).padStart(2, '0')} / {String(EVENT_COUNT).padStart(2, '0')}
      </p>
    </div>
  )
}

export default HeroUI
