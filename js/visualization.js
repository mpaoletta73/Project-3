/**
 * visualization.js — D3.js Engine
 *
 * Exposes the Visualization class with three public methods:
 *   init()               — Creates SVG, axes, scales (call once)
 *   update(data)         — Binds new data and transitions marks
 *   setChartType(type)   — Switches between 'line', 'scatter', 'bar'
 *
 * main.js owns state; this file is purely presentational.
 */

class Visualization {
  /**
   * @param {string} containerSelector - CSS selector for the host <div>
   * @param {string} tooltipSelector   - CSS selector for the tooltip <div>
   */
  constructor(containerSelector, tooltipSelector) {
    this.containerEl = document.querySelector(containerSelector);
    this.tooltipEl   = document.querySelector(tooltipSelector);
    this.chartType   = 'line';

    // Margin convention (room for axes + labels)
    this.margin = { top: 30, right: 40, bottom: 60, left: 70 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT — run once on page load
  // ═══════════════════════════════════════════════════════════════════════════

  init() {
    // Derive dimensions from the container's current width
    const totalWidth  = this.containerEl.clientWidth  || 800;
    const totalHeight = Math.max(420, Math.round(totalWidth * 0.5));

    this.width  = totalWidth  - this.margin.left - this.margin.right;
    this.height = totalHeight - this.margin.top  - this.margin.bottom;

    // ── SVG root ───────────────────────────────────────────────────────────
    this.svg = d3.select(this.containerEl)
      .append('svg')
        .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .attr('aria-label', 'Environmental data chart');

    // Inner group shifted by margins
    this.g = this.svg.append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // ── Scales (domains set in update()) ───────────────────────────────────
    this.xScale = d3.scaleLinear().range([0, this.width]);
    this.yScale = d3.scaleLinear().range([this.height, 0]);

    // Color scale for scatter/bar (sequential – viridis)
    this.colorScale = d3.scaleSequential(d3.interpolateViridis);

    // ── Grid ───────────────────────────────────────────────────────────────
    this.xGridG = this.g.append('g').attr('class', 'grid x-grid')
      .attr('transform', `translate(0,${this.height})`);
    this.yGridG = this.g.append('g').attr('class', 'grid y-grid');

    // ── Axes ───────────────────────────────────────────────────────────────
    this.xAxisG = this.g.append('g').attr('class', 'axis x-axis')
      .attr('transform', `translate(0,${this.height})`);
    this.yAxisG = this.g.append('g').attr('class', 'axis y-axis');

    // Axis labels
    this.g.append('text')
      .attr('class', 'axis-label x-axis-label')
      .attr('text-anchor', 'middle')
      .attr('x', this.width / 2)
      .attr('y', this.height + 48)
      .text('Year');

    this.yAxisLabel = this.g.append('text')
      .attr('class', 'axis-label y-axis-label')
      .attr('text-anchor', 'middle')
      .attr('transform', `rotate(-90)`)
      .attr('x', -this.height / 2)
      .attr('y', -55)
      .text('Value');

    // ── Marks layer (sits below tooltip overlay) ───────────────────────────
    this.marksG = this.g.append('g').attr('class', 'marks');

    // ── Clip path so marks don't overflow axes ─────────────────────────────
    this.svg.append('defs').append('clipPath')
      .attr('id', 'vis-clip')
      .append('rect')
        .attr('width',  this.width)
        .attr('height', this.height);

    this.marksG.attr('clip-path', 'url(#vis-clip)');

    // ── Transparent overlay for mouse events on line/area charts ──────────
    this.overlay = this.g.append('rect')
      .attr('class', 'overlay')
      .attr('width',  this.width)
      .attr('height', this.height)
      .style('fill', 'none')
      .style('pointer-events', 'all');

    // Handle window resize
    window.addEventListener('resize', () => this._onResize());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE — called whenever data or filters change
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {Array<Object>} data - filtered, typed rows from main.js
   */
  update(data) {
    this._currentData = data;

    if (!data || data.length === 0) {
      this._showNoData();
      return;
    }

    this._clearNoData();

    // Update y-axis label text to reflect the active variable
    const variable = data[0]?.variable || '';
    const unit     = data[0]?.unit     || '';
    this.yAxisLabel.text(unit ? `${this._labelFor(variable)} (${unit})` : this._labelFor(variable));

    // ── Update scales ─────────────────────────────────────────────────────
    const xExtent = d3.extent(data, d => d.year);
    const yExtent = d3.extent(data, d => d.value);
    const yPad    = (yExtent[1] - yExtent[0]) * 0.1 || 1;

    this.xScale.domain([xExtent[0] - 0.5, xExtent[1] + 0.5]);
    this.yScale.domain([yExtent[0] - yPad, yExtent[1] + yPad]);
    this.colorScale.domain(yExtent);

    // ── Re-draw axes ──────────────────────────────────────────────────────
    const xAxis = d3.axisBottom(this.xScale)
      .ticks(Math.min(data.length, 10))
      .tickFormat(d3.format('d'));
    const yAxis = d3.axisLeft(this.yScale).ticks(6);

    this.xAxisG.transition().duration(300).call(xAxis);
    this.yAxisG.transition().duration(300).call(yAxis);

    // ── Grid lines ────────────────────────────────────────────────────────
    this.xGridG.transition().duration(300).call(
      d3.axisBottom(this.xScale).ticks(10).tickSize(-this.height).tickFormat(''));
    this.yGridG.transition().duration(300).call(
      d3.axisLeft(this.yScale).ticks(6).tickSize(-this.width).tickFormat(''));

    // ── Dispatch to the correct chart renderer ────────────────────────────
    this.marksG.selectAll('*').remove(); // clear previous marks

    switch (this.chartType) {
      case 'scatter': this._drawScatter(data); break;
      case 'bar':     this._drawBar(data);     break;
      default:        this._drawLine(data);
    }
  }

  // ─── Chart-type setter ──────────────────────────────────────────────────

  setChartType(type) {
    this.chartType = type;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHART RENDERERS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Line chart ────────────────────────────────────────────────────────────

  _drawLine(data) {
    const lineGen = d3.line()
      .x(d => this.xScale(d.year))
      .y(d => this.yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Path
    const path = this.marksG.append('path')
      .datum(data)
      .attr('class', 'line-path')
      .attr('d', lineGen);

    // Animate path drawing
    const totalLength = path.node().getTotalLength();
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition().duration(600).ease(d3.easeCubicOut)
        .attr('stroke-dashoffset', 0);

    // Dots on every data point
    this.marksG.selectAll('.dot')
      .data(data)
      .join(
        enter => enter.append('circle')
          .attr('class', 'dot')
          .attr('r', 0)
          .attr('cx', d => this.xScale(d.year))
          .attr('cy', d => this.yScale(d.value))
          .call(sel => sel.transition().duration(400).delay((_, i) => i * 20).attr('r', 4)),
        update => update
          .transition().duration(300)
            .attr('cx', d => this.xScale(d.year))
            .attr('cy', d => this.yScale(d.value)),
        exit => exit.transition().duration(200).attr('r', 0).remove()
      )
      .on('mouseover', (event, d) => this._showTooltip(event, d))
      .on('mousemove', (event)    => this._moveTooltip(event))
      .on('mouseout',  ()         => this._hideTooltip());
  }

  // ── Scatter chart ─────────────────────────────────────────────────────────

  _drawScatter(data) {
    this.marksG.selectAll('.dot')
      .data(data)
      .join(
        enter => enter.append('circle')
          .attr('class', 'dot')
          .attr('r', 0)
          .attr('cx', d => this.xScale(d.year))
          .attr('cy', d => this.yScale(d.value))
          .style('fill', d => this.colorScale(d.value))
          .call(sel => sel.transition().duration(400).delay((_, i) => i * 15).attr('r', 5)),
        update => update
          .transition().duration(300)
            .attr('cx', d => this.xScale(d.year))
            .attr('cy', d => this.yScale(d.value))
            .style('fill', d => this.colorScale(d.value)),
        exit => exit.transition().duration(200).attr('r', 0).remove()
      )
      .on('mouseover', (event, d) => this._showTooltip(event, d))
      .on('mousemove', (event)    => this._moveTooltip(event))
      .on('mouseout',  ()         => this._hideTooltip());
  }

  // ── Bar chart ─────────────────────────────────────────────────────────────

  _drawBar(data) {
    // Recalculate x as a band scale for bars
    const years  = data.map(d => d.year);
    const xBand  = d3.scaleBand()
      .domain(years)
      .range([0, this.width])
      .padding(0.25);

    this.marksG.selectAll('.bar-rect')
      .data(data)
      .join(
        enter => enter.append('rect')
          .attr('class', 'bar-rect')
          .attr('x',     d => xBand(d.year))
          .attr('width', xBand.bandwidth())
          .attr('y',     this.yScale(0) || this.height)
          .attr('height', 0)
          .style('fill', d => this.colorScale(d.value))
          .call(sel => sel.transition().duration(500).delay((_, i) => i * 20)
            .attr('y',      d => this.yScale(Math.max(0, d.value)))
            .attr('height', d => Math.abs(this.yScale(d.value) - (this.yScale(0) || this.height)))),
        update => update
          .transition().duration(300)
            .attr('x',      d => xBand(d.year))
            .attr('width',  xBand.bandwidth())
            .attr('y',      d => this.yScale(Math.max(0, d.value)))
            .attr('height', d => Math.abs(this.yScale(d.value) - (this.yScale(0) || this.height)))
            .style('fill',  d => this.colorScale(d.value)),
        exit => exit.transition().duration(200)
          .attr('height', 0)
          .attr('y', this.height)
          .remove()
      )
      .on('mouseover', (event, d) => this._showTooltip(event, d))
      .on('mousemove', (event)    => this._moveTooltip(event))
      .on('mouseout',  ()         => this._hideTooltip());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOLTIP
  // ═══════════════════════════════════════════════════════════════════════════

  _showTooltip(event, d) {
    const fmt = d3.format(',.2f');
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.innerHTML = `
      <strong>${d.year}</strong>
      ${this._labelFor(d.variable)}: <strong>${fmt(d.value)} ${d.unit}</strong><br/>
      Region: ${d.region.replace(/_/g, ' ')}<br/>
      Model: ${d.model}
    `;
    this._moveTooltip(event);
  }

  _moveTooltip(event) {
    const containerRect = this.containerEl.getBoundingClientRect();
    let x = event.clientX - containerRect.left + 14;
    let y = event.clientY - containerRect.top  - 28;

    // Prevent overflow on the right edge
    const tipWidth = this.tooltipEl.offsetWidth;
    if (x + tipWidth > containerRect.width - 10) {
      x = event.clientX - containerRect.left - tipWidth - 14;
    }

    this.tooltipEl.style.left = `${x}px`;
    this.tooltipEl.style.top  = `${y}px`;
  }

  _hideTooltip() {
    this.tooltipEl.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  _labelFor(variable) {
    const labels = {
      temperature:   'Temperature',
      precipitation: 'Precipitation',
      co2:           'CO\u2082 Concentration',
      sea_level:     'Sea Level Anomaly',
    };
    return labels[variable] || variable;
  }

  _showNoData() {
    this.marksG.selectAll('*').remove();
    this.marksG.append('text')
      .attr('class', 'no-data-label')
      .attr('x', this.width  / 2)
      .attr('y', this.height / 2)
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--color-muted)')
      .style('font-size', '0.95rem')
      .text('No data for the selected filters.');
  }

  _clearNoData() {
    this.marksG.selectAll('.no-data-label').remove();
  }

  _onResize() {
    // Re-derive dimensions from container
    const totalWidth  = this.containerEl.clientWidth;
    if (!totalWidth) return;

    const totalHeight = Math.max(420, Math.round(totalWidth * 0.5));
    this.width  = totalWidth  - this.margin.left - this.margin.right;
    this.height = totalHeight - this.margin.top  - this.margin.bottom;

    this.svg.attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

    this.xScale.range([0, this.width]);
    this.yScale.range([this.height, 0]);

    this.xAxisG.attr('transform', `translate(0,${this.height})`);
    this.xGridG.attr('transform', `translate(0,${this.height})`);

    this.svg.select('.x-axis-label')
      .attr('x', this.width / 2)
      .attr('y', this.height + 48);

    this.svg.select('.y-axis-label')
      .attr('x', -this.height / 2);

    this.overlay
      .attr('width',  this.width)
      .attr('height', this.height);

    this.svg.select('#vis-clip rect')
      .attr('width',  this.width)
      .attr('height', this.height);

    if (this._currentData) this.update(this._currentData);
  }
}
