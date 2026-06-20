// Mascota "Chubi" (todo CSS). El estado se controla con la clase chubi-<estado>:
// idle | listening | thinking | happy. Portado de partials/chubi.ejs.
export default function Chubi({ estado = 'idle', size = 168, id }) {
  return (
    <div
      className={`chubi chubi-${estado}`}
      id={id}
      style={{ width: size, height: size }}
    >
      <div className="chubi-ring chubi-ring-1"></div>
      <div className="chubi-ring chubi-ring-2"></div>
      <div className="chubi-ring chubi-ring-3"></div>
      <div className="chubi-think">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div className="chubi-spark chubi-spark-1">✦</div>
      <div className="chubi-spark chubi-spark-2">✦</div>
      <div className="chubi-spark chubi-spark-3">✦</div>
      <div className="chubi-spark chubi-spark-4">✧</div>

      <div className="chubi-bob">
        <div className="chubi-feet">
          <div className="chubi-foot"></div>
          <div className="chubi-foot"></div>
        </div>
        <div className="chubi-body">
          <div className="chubi-arm chubi-arm-l"></div>
          <div className="chubi-arm chubi-arm-r"></div>
          <div className="chubi-cheek chubi-cheek-l"></div>
          <div className="chubi-cheek chubi-cheek-r"></div>
          <div className="chubi-face">
            <div className="chubi-eyes">
              <div className="chubi-eye"><div className="chubi-pupil"><div className="chubi-shine"></div></div></div>
              <div className="chubi-eye"><div className="chubi-pupil"><div className="chubi-shine"></div></div></div>
              <div className="chubi-eye-happy"></div>
              <div className="chubi-eye-happy"></div>
            </div>
            <div className="chubi-mouth-wrap">
              <div className="chubi-mouth-smile"></div>
              <div className="chubi-mouth-o"></div>
              <div className="chubi-mouth-flat"></div>
              <div className="chubi-mouth-big"><div className="chubi-tongue"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
