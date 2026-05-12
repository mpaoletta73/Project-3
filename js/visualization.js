class FinalSSTVisualization {
  constructor(tooltipSelector, onSelectDate) {
    this.tooltip = d3.select(tooltipSelector);
    this.onSelectDate = onSelectDate;
    this.regionOrder = ['western_pacific', 'central_pacific', 'nino_34', 'eastern_pacific'];
    this.phaseOrder = ['La Niña', 'Neutral', 'El Niño'];
    this.months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    this.color = d3.scaleDiverging([-2.6, 0, 2.6], t => d3.interpolateRdBu(1 - t)).clamp(true);
    this.regionColor = d3.scaleOrdinal()
      .domain(['Western Pacific', 'Central Pacific', 'Niño 3.4', 'Eastern Pacific'])
      .range(['#4c78a8', '#59a14f', '#f28e2b', '#e15759']);
    this.phaseColor = d3.scaleOrdinal()
      .domain(this.phaseOrder)
      .range(['#326ca8', '#8b97a3', '#b84a45']);
  }

  draw(rows, filters) {
    this.drawOverview(rows, filters);
    this.drawProfile(rows, filters);
    this.drawPhaseBars(rows, filters);
    this.drawHeatmap(rows, filters);
  }

  drawOverview(rows, filters) {
    const data = rows.filter(d => d.region === 'nino_34');
    const selectedDate = filters.date;
    const filteredSet = new Set(filters.filteredDates);
    const selected = data.find(d => d.date === selectedDate);
    const { svg, g, width, height } = createChart('#overview-chart', 980, 390, { top: 24, right: 28, bottom: 118, left: 62 });
    const contextHeight = 54;
    const contextY = height + 44;

    const x = d3.scaleUtc().domain(d3.extent(data, d => d.time)).range([0, width]);
    const y = d3.scaleLinear().domain([-2.6, 2.6]).range([height, 0]);
    const x2 = x.copy();
    const y2 = d3.scaleLinear().domain(y.domain()).range([contextHeight, 0]);
    const line = scale => d3.line()
      .x(d => scale(d.time))
      .y(d => y(d.anomaly))
      .curve(d3.curveMonotoneX);

    addGrid(g, y, width);
    this.addPhaseBands(g, data, x, height);
    g.append('line').attr('class', 'zero-line').attr('x2', width).attr('y1', y(0)).attr('y2', y(0));
    g.append('line').attr('class', 'threshold-line').attr('x2', width).attr('y1', y(0.5)).attr('y2', y(0.5));
    g.append('line').attr('class', 'threshold-line').attr('x2', width).attr('y1', y(-0.5)).attr('y2', y(-0.5));

    const focusPath = g.append('path')
      .datum(data)
      .attr('class', 'main-line')
      .attr('d', line(x));

    const dots = g.selectAll('.overview-dot')
      .data(data.filter(d => filteredSet.has(d.date)))
      .join('circle')
      .attr('class', 'overview-dot')
      .attr('cx', d => x(d.time))
      .attr('cy', d => y(d.anomaly))
      .attr('r', d => d.date === selectedDate ? 6 : 3.4)
      .attr('fill', d => this.color(d.anomaly))
      .on('click', (event, d) => this.onSelectDate(d.date))
      .on('mousemove', (event, d) => this.showTooltip(event, tooltipHTML(d)))
      .on('mouseleave', () => this.hideTooltip());

    if (selected) {
      g.append('line')
        .attr('class', 'selected-line')
        .attr('x1', x(selected.time))
        .attr('x2', x(selected.time))
        .attr('y1', 0)
        .attr('y2', height);
    }

    const xAxis = g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(8));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(6));
    addAxisLabels(g, width, height, 'Year', 'Niño 3.4 SST anomaly (°C)');

    const context = svg.append('g').attr('transform', `translate(62,${contextY})`);
    context.append('path')
      .datum(data)
      .attr('class', 'context-line')
      .attr('d', d3.line().x(d => x2(d.time)).y(d => y2(d.anomaly)).curve(d3.curveMonotoneX));
    context.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${contextHeight})`)
      .call(d3.axisBottom(x2).ticks(8));

    const brush = d3.brushX()
      .extent([[0, 0], [width, contextHeight]])
      .on('brush end', event => {
        if (!event.selection) return;
        const [start, end] = event.selection.map(x2.invert);
        x.domain([start, end]);
        focusPath.attr('d', line(x));
        dots
          .attr('cx', d => x(d.time))
          .attr('cy', d => y(d.anomaly));
        g.selectAll('.phase-band').attr('x', d => x(d.time)).attr('width', Math.max(1, width / data.length));
        g.selectAll('.selected-line').attr('x1', x(selected.time)).attr('x2', x(selected.time));
        xAxis.call(d3.axisBottom(x).ticks(6));
      });

    context.append('g').attr('class', 'brush').call(brush);
    this.addPhaseLegend(g, width - 286, 8);
  }

  drawProfile(rows, filters) {
    const data = rows
      .filter(d => d.date === filters.date && filters.regions.includes(d.region))
      .sort((a, b) => d3.ascending(a.longitude, b.longitude));
    const { g, width, height } = createChart('#profile-chart', 560, 430, { top: 28, right: 28, bottom: 118, left: 62 });
    const x = d3.scaleLinear().domain([135, 260]).range([0, width]);
    const y = d3.scaleLinear().domain([-2.6, 2.6]).range([height, 0]);

    addGrid(g, y, width);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}E`));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5));
    g.append('line').attr('class', 'zero-line').attr('x2', width).attr('y1', y(0)).attr('y2', y(0));

    if (data.length > 1) {
      g.append('path')
        .datum(data)
        .attr('class', 'profile-line')
        .attr('d', d3.line().x(d => x(d.longitude)).y(d => y(d.anomaly)).curve(d3.curveMonotoneX));
    }

    g.selectAll('circle')
      .data(data)
      .join('circle')
      .attr('class', 'profile-dot')
      .attr('cx', d => x(d.longitude))
      .attr('cy', d => y(d.anomaly))
      .attr('r', 10)
      .attr('fill', d => this.color(d.anomaly))
      .on('mousemove', (event, d) => this.showTooltip(event, tooltipHTML(d)))
      .on('mouseleave', () => this.hideTooltip());

    g.selectAll('.point-label')
      .data(data)
      .join('text')
      .attr('class', 'point-label')
      .attr('x', d => x(d.longitude))
      .attr('y', d => y(d.anomaly) + (d.anomaly >= 0 ? -17 : 25))
      .attr('text-anchor', 'middle')
      .text(d => labelShort(d.regionLabel));

    g.append('text')
      .attr('class', 'chart-title')
      .attr('x', 0)
      .attr('y', -10)
      .text(`${formatMonth(filters.date)} profile`);
    addAxisLabels(g, width, height, 'Longitude across equatorial Pacific', 'SST anomaly (°C)');
    this.addAnomalyLegend(g, 0, height + 70, width);
  }

  drawPhaseBars(rows, filters) {
    const visibleRows = rows.filter(d => filters.regions.includes(d.region));
    const summaries = d3.rollups(
      visibleRows,
      values => d3.mean(values, d => d.anomaly),
      d => d.regionLabel,
      d => d.phase
    ).flatMap(([region, byPhase]) => byPhase.map(([phase, anomaly]) => ({ region, phase, anomaly })))
      .sort((a, b) => {
        const regionCompare = d3.ascending(this.regionColor.domain().indexOf(a.region), this.regionColor.domain().indexOf(b.region));
        return regionCompare || d3.ascending(this.phaseOrder.indexOf(a.phase), this.phaseOrder.indexOf(b.phase));
      });

    const { g, width, height } = createChart('#phase-chart', 560, 390, { top: 28, right: 20, bottom: 96, left: 62 });
    const regions = Array.from(new Set(summaries.map(d => d.region)));
    const x = d3.scaleBand().domain(regions).range([0, width]).padding(0.22);
    const xPhase = d3.scaleBand().domain(this.phaseOrder).range([0, x.bandwidth()]).padding(0.08);
    const extent = d3.extent(summaries, d => d.anomaly);
    const y = d3.scaleLinear().domain([Math.min(-1.7, extent[0] || -0.4), Math.max(1.7, extent[1] || 0.4)]).nice().range([height, 0]);

    addGrid(g, y, width);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(labelShort));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5));
    g.append('line').attr('class', 'zero-line').attr('x2', width).attr('y1', y(0)).attr('y2', y(0));

    g.selectAll('rect')
      .data(summaries)
      .join('rect')
      .attr('x', d => x(d.region) + xPhase(d.phase))
      .attr('y', d => y(Math.max(0, d.anomaly)))
      .attr('width', xPhase.bandwidth())
      .attr('height', d => Math.abs(y(d.anomaly) - y(0)))
      .attr('fill', d => this.phaseColor(d.phase))
      .attr('opacity', d => filters.phase === 'all' || filters.phase === d.phase ? 1 : 0.32)
      .on('mousemove', (event, d) => {
        this.showTooltip(event, `<strong>${d.region}</strong><br>${d.phase}: ${formatSigned(d.anomaly)}°C average`);
      })
      .on('mouseleave', () => this.hideTooltip());

    const title = filters.phase === 'all' ? 'All phase averages shown' : `${filters.phase} emphasized; other phases retained for comparison`;
    g.append('text').attr('class', 'chart-title').attr('x', 0).attr('y', -10).text(title);
    this.addPhaseBarLegend(g, width - 238, -18, filters.phase);
    addAxisLabels(g, width, height, 'Pacific region', 'Average SST anomaly (°C)');
  }

  drawHeatmap(rows, filters) {
    const visibleRows = rows.filter(d => filters.regions.includes(d.region));
    const data = d3.rollups(
      visibleRows,
      values => d3.mean(values, d => d.anomaly),
      d => d.year,
      d => d.month
    ).flatMap(([year, byMonth]) => byMonth.map(([month, anomaly]) => ({ year, month, anomaly })));

    const years = Array.from(new Set(data.map(d => d.year))).sort(d3.ascending);
    const { g, width, height } = createChart('#heatmap-chart', 980, 360, { top: 24, right: 28, bottom: 86, left: 50 });
    const x = d3.scaleBand().domain(years).range([0, width]).padding(0.03);
    const y = d3.scaleBand().domain(d3.range(1, 13)).range([0, height]).padding(0.04);

    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', d => x(d.year))
      .attr('y', d => y(d.month))
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('fill', d => this.color(d.anomaly))
      .on('mousemove', (event, d) => {
        this.showTooltip(event, `<strong>${this.months[d.month - 1]} ${d.year}</strong><br>Selected-region average: ${d.anomaly.toFixed(2)}°C`);
      })
      .on('mouseleave', () => this.hideTooltip());

    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickValues(years.filter(year => year % 2 === 0)).tickFormat(d3.format('d')));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).tickFormat(d => this.months[d - 1]));
    this.addAnomalyLegend(g, 0, height + 42, width);
  }

  addPhaseBands(g, data, x, height) {
    g.selectAll('.phase-band')
      .data(data.filter(d => d.phase !== 'Neutral'))
      .join('rect')
      .attr('class', 'phase-band')
      .attr('x', d => x(d.time))
      .attr('y', 0)
      .attr('width', Math.max(1, x(data[1].time) - x(data[0].time)))
      .attr('height', height)
      .attr('fill', d => d.phase === 'El Niño' ? '#f4b7ad' : '#b8d2f0')
      .attr('opacity', 0.28);
  }

  addPhaseLegend(g, x, y) {
    const items = [
      ['#f4b7ad', 'El Niño-like'],
      ['#b8d2f0', 'La Niña-like'],
    ];
    const legend = g.append('g').attr('class', 'phase-legend').attr('transform', `translate(${x},${y})`);
    items.forEach(([color, label], index) => {
      const item = legend.append('g').attr('transform', `translate(${index * 132},0)`);
      item.append('rect').attr('width', 13).attr('height', 13).attr('fill', color).attr('opacity', 0.7);
      item.append('text').attr('class', 'legend-label').attr('x', 18).attr('y', 11).text(label);
    });
  }

  addPhaseBarLegend(g, x, y, selectedPhase) {
    const legend = g.append('g').attr('class', 'phase-legend').attr('transform', `translate(${x},${y})`);
    this.phaseOrder.forEach((phase, index) => {
      const item = legend.append('g').attr('transform', `translate(${index * 76},0)`);
      item.append('rect')
        .attr('width', 11)
        .attr('height', 11)
        .attr('fill', this.phaseColor(phase))
        .attr('opacity', selectedPhase === 'all' || selectedPhase === phase ? 1 : 0.38);
      item.append('text').attr('class', 'legend-label').attr('x', 15).attr('y', 10).text(phase);
    });
  }

  addAnomalyLegend(g, x, y, width) {
    const id = `legend-${Math.random().toString(16).slice(2)}`;
    const gradient = g.append('defs').append('linearGradient').attr('id', id);
    d3.range(0, 1.01, 0.1).forEach(t => {
      gradient.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', this.color(-2.6 + t * 5.2));
    });
    const legendWidth = Math.min(300, width);
    const legendX = x + Math.max(0, (width - legendWidth) / 2);
    g.append('text')
      .attr('class', 'legend-title')
      .attr('x', legendX)
      .attr('y', y - 8)
      .text('SST anomaly: departure from normal (°C)');
    g.append('rect')
      .attr('x', legendX)
      .attr('y', y)
      .attr('width', legendWidth)
      .attr('height', 10)
      .attr('fill', `url(#${id})`);
    g.append('text').attr('class', 'legend-label').attr('x', legendX).attr('y', y + 28).text('cooler');
    g.append('text').attr('class', 'legend-label').attr('x', legendX + legendWidth / 2).attr('y', y + 28).attr('text-anchor', 'middle').text('0°C');
    g.append('text').attr('class', 'legend-label').attr('x', legendX + legendWidth).attr('y', y + 28).attr('text-anchor', 'end').text('warmer');
  }

  showTooltip(event, html) {
    this.tooltip
      .attr('hidden', null)
      .style('left', `${event.pageX + 14}px`)
      .style('top', `${event.pageY - 28}px`)
      .html(html);
  }

  hideTooltip() {
    this.tooltip.attr('hidden', true);
  }
}

function createChart(selector, outerWidth, outerHeight, margin) {
  d3.select(selector).selectAll('*').remove();
  const width = outerWidth - margin.left - margin.right;
  const height = outerHeight - margin.top - margin.bottom;
  const svg = d3.select(selector)
    .append('svg')
    .attr('viewBox', `0 0 ${outerWidth} ${outerHeight}`)
    .attr('role', 'img');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  return { svg, g, width, height };
}

function addGrid(g, y, width) {
  g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(''));
}

function addAxisLabels(g, width, height, xLabel, yLabel) {
  g.append('text').attr('class', 'axis-label').attr('x', width / 2).attr('y', height + 44).attr('text-anchor', 'middle').text(xLabel);
  g.append('text').attr('class', 'axis-label').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -42).attr('text-anchor', 'middle').text(yLabel);
}

function labelShort(label) {
  return label.replace('Western Pacific', 'West').replace('Central Pacific', 'Central').replace('Eastern Pacific', 'East');
}

function tooltipHTML(d) {
  return `
    <strong>${formatMonth(d.date)}</strong><br>
    ${d.regionLabel}: <strong>${d.anomaly.toFixed(2)}°C</strong><br>
    Phase: ${d.phase}<br>
    Point: ${d.latitude}N, ${d.longitude}E
  `;
}

function formatSigned(value) {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}
