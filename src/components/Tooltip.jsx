import { useState } from 'react'

// One little hook so every chart gets the same hover behaviour. It anchors to
// the element's box rather than the mouse, so the tooltip doesn't jitter, and
// it fires on focus too so you can tab through a chart.
export function useTooltip() {
  const [tip, setTip] = useState(null)

  const show = (event, content) => {
    const box = event.currentTarget.getBoundingClientRect()
    setTip({ content, x: box.left + box.width / 2, y: box.top - 8 })
  }
  const hide = () => setTip(null)

  return {
    tip,
    hoverProps: (content) => ({
      tabIndex: 0,
      onMouseEnter: (e) => show(e, content),
      onMouseLeave: hide,
      onFocus: (e) => show(e, content),
      onBlur: hide,
    }),
  }
}

export function Tooltip({ tip }) {
  if (!tip) return null
  return (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.content}
    </div>
  )
}
