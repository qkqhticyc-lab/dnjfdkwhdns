const namespace = 'http://www.w3.org/2000/svg';

export function priceCrosshair(chart, {left, right, top, bottom, min, max, format,
  interactive = true, labelWidth = 88, fontSize = 11, color = '#a9bdc8'} = {}) {
  const width = chart.viewBox.baseVal.width;
  const create = (tag, attributes) => {
    const element = document.createElementNS(namespace, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  const group = create('g', {'data-price-crosshair': '', visibility: 'hidden', 'pointer-events': 'none', 'aria-hidden': 'true'});
  const line = create('line', {'data-price-crosshair-line': '', x1: left, x2: right, stroke: color, 'stroke-width': 1, 'stroke-dasharray': '3 4'});
  const boxWidth = Math.min(labelWidth, width - left);
  const labelX = Math.min(right, width - boxWidth);
  const background = create('rect', {x: labelX, width: boxWidth, height: 22, rx: 3, fill: '#284553'});
  const label = create('text', {'data-price-crosshair-label': '', x: labelX + boxWidth - 5,
    'text-anchor': 'end', fill: '#ffffff', 'font-size': fontSize, 'font-family': 'sans-serif'});
  group.append(line, background, label);
  chart.append(group);

  function hide() {
    group.setAttribute('visibility', 'hidden');
    delete group.dataset.priceValue;
  }
  function showAt(y) {
    if (!Number.isFinite(y) || y < top || y > bottom || !(max > min)) { hide(); return; }
    const value = max - (y - top) / (bottom - top) * (max - min);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    const labelY = Math.max(top, Math.min(bottom - 22, y - 11));
    background.setAttribute('y', labelY);
    label.setAttribute('y', labelY + 15);
    label.textContent = format(value);
    label.setAttribute('font-size', Math.min(fontSize, Math.max(7, (boxWidth - 10) / (label.textContent.length * .6))));
    group.dataset.priceValue = value;
    group.setAttribute('visibility', 'visible');
    chart.append(group);
  }
  if (interactive) {
    const move = event => {
      const matrix = chart.getScreenCTM();
      if (!matrix) return;
      const point = chart.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(matrix.inverse());
      if (local.x < left || local.x > right) hide();
      else showAt(local.y);
    };
    chart.addEventListener('pointermove', move);
    chart.addEventListener('pointerdown', move);
    chart.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') hide(); });
    chart.addEventListener('pointercancel', hide);
  }
  return {showAt, hide};
}
