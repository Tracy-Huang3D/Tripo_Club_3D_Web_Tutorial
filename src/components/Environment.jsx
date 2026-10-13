function Environment() {
  return (
    <div className="environment-layer" aria-hidden="true">
      <div className="environment-word environment-word--create">CREATE</div>
      <div className="environment-word environment-word--share">SHARE</div>

      <div className="environment-crosshair environment-crosshair--left">
        <span />
      </div>
      <div className="environment-crosshair environment-crosshair--right">
        <span />
      </div>
      <div className="environment-measure environment-measure--top"><i /><i /><i /></div>
      <div className="environment-measure environment-measure--side"><i /><i /><i /></div>

      <span className="environment-particle environment-particle--one" />
      <span className="environment-particle environment-particle--two" />
      <span className="environment-particle environment-particle--three" />
      <span className="environment-particle environment-particle--four" />
      <span className="environment-particle environment-particle--five" />
    </div>
  )
}

export default Environment
