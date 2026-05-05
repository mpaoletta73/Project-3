class CheckpointVisualizations {
  constructor(tooltipSelector) {
    this.tooltip = d3.select(tooltipSelector);
    this.regionOrder = ['western_pacific', 'central_pacific', 'nino_34', 'eastern_pacific'];
    this.phaseOrder = ['La Niña', 'Neutral', 'El Niño'];
    this.months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    this.color = d3.scaleDiverging([-2.5, 0, 2.5], d3.interpolateRdBu).clamp(true);
    this.regionColor = d3.scaleOrdinal()
      .domain(['Western Pacific', 'Central Pacific', 'Nino 3.4', 'Eastern Pacific'])
      .range(['#4c78a8', '#59a14f', '#f28e2b', '#e15759']);
  }

  drawAll(rows) {
    this.drawTimeSeries(rows);
    this.drawHeatmap(rows);
    this.drawPhaseBars(rows);
    this.drawSmallMultiples(rows);
    this.drawLongitudeProfile(rows);
  }

  drawTimeSeries(rows) {
    const data = rows.filter(d => d.region === 'nino_34').map(d => ({ ...d, time: parseDate(d.date) }));
    const { g, width, height } = createChart('#time-series', 900, 350, { top: 28, right: 28, bottom: 62, left: 68 });
    const x = d3.scaleUtc().domain(d3.extent(data, d => d.time)).range([0, width]);
    const y = d3.scaleLinear().domain(d3.extent(data, d => d.anomaly)).nice().range([height, 0]);

    addGrid(g, y, width);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(8));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(6));
    g.append('line').attr('class', 'zero-line').attr('x2', width).attr('y1', y(0)).attr('y2', y(0));
    g.append('line').attr('class', 'threshold-line').attr('x2', width).attr('y1', y(0.5)).attr('y2', y(0.5));

    g.append('path')
      .datum(data)
      .attr('class', 'main-line')
      .attr('d', d3.line().x(d => x(d.time)).y(d => y(d.anomaly)).curve(d3.curveMonotoneX));

    g.selectAll('circle')
      .data(data.filter(d => d.phase === 'El Niño'))
      .join('circle')
      .attr('class', 'event-dot')
      .attr('cx', d => x(d.time))
      .attr('cy', d => y(d.anomaly))
      .attr('r', 3.5)
      .on('mousemove', (event, d) => this.showTooltip(event, tooltipHTML(d)))
      .on('mouseleave', () => this.hideTooltip());

    addAxisLabels(g, width, height, 'Year', 'SST anomaly (°C)');
    g.append('text').attr('class', 'note').attr('x', width - 205).attr('y', y(0.5) - 9).text('+0.5°C El Nino-like threshold');
  }

  drawHeatmap(rows) {
    const data = rows.filter(d => d.region === 'nino_34');
    const years = Array.from(new Set(data.map(d => d.year))).sort(d3.ascending);
    const { g, width, height } = createChart('#heatmap', 580, 390, { top: 24, right: 28, bottom: 88, left: 48 });
    const x = d3.scaleBand().domain(years).range([0, width]).padding(0.04);
    const y = d3.scaleBand().domain(d3.range(1, 13)).range([0, height]).padding(0.05);

    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', d => x(d.year))
      .attr('y', d => y(d.month))
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('fill', d => this.color(-d.anomaly))
      .on('mousemove', (event, d) => this.showTooltip(event, tooltipHTML(d)))
      .on('mouseleave', () => this.hideTooltip());

    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickValues(years.filter(y => y % 4 === 0)).tickFormat(d3.format('d')));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).tickFormat(d => this.months[d - 1]));
    this.addAnomalyLegend(g, 0, height + 42, width);
  }

  drawPhaseBars(rows) {
    const summaries = d3.rollups(
      rows,
      values => d3.mean(values, d => d.anomaly),
      d => d.phase,
      d => d.regionLabel
    ).flatMap(([phase, byRegion]) => byRegion.map(([region, anomaly]) => ({ phase, region, anomaly })));

    const regionLabels = ['Western Pacific', 'Central Pacific', 'Nino 3.4', 'Eastern Pacific'];
    const { g, width, height } = createChart('#phase-bars', 580, 390, { top: 28, right: 20, bottom: 104, left: 64 });
    const x0 = d3.scaleBand().domain(this.phaseOrder).range([0, width]).padding(0.24);
    const x1 = d3.scaleBand().domain(regionLabels).range([0, x0.bandwidth()]).padding(0.08);
    const y = d3.scaleLinear().domain(d3.extent(summaries, d => d.anomaly)).nice().range([height, 0]);

    addGrid(g, y, width);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x0));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5));
    g.append('line').attr('class', 'zero-line').attr('x2', width).attr('y1', y(0)).attr('y2', y(0));

    g.selectAll('rect')
      .data(summaries)
      .join('rect')
      .attr('x', d => x0(d.phase) + x1(d.region))
      .attr('y', d => y(Math.max(0, d.anomaly)))
      .attr('width', x1.bandwidth())
      .attr('height', d => Math.abs(y(d.anomaly) - y(0)))
      .attr('fill', d => this.regionColor(d.region))
      .on('mousemove', (event, d) => this.showTooltip(event, `<strong>${d.phase}</strong><br>${d.region}: ${d.anomaly.toFixed(2)}°C`))
      .on('mouseleave', () => this.hideTooltip());

    addAxisLabels(g, width, height, 'Climate phase from Nino 3.4 anomaly', 'Average SST anomaly (°C)');
    this.addRegionLegend(g, 0, height + 58, regionLabels);
  }

  drawSmallMultiples(rows) {
    const regions = this.regionOrder.filter(d => d !== 'nino_34');
    const { g, width, height } = createChart('#small-multiples', 900, 380, { top: 34, right: 26, bottom: 58, left: 58 });
    const gap = 40;
    const panelWidth = (width - gap * (regions.length - 1)) / regions.length;
    const x = d3.scaleUtc().domain(d3.extent(rows, d => parseDate(d.date))).range([0, panelWidth]);
    const y = d3.scaleLinear().domain(d3.extent(rows, d => d.anomaly)).nice().range([height, 0]);
    const line = d3.line().x(d => x(parseDate(d.date))).y(d => y(d.anomaly)).curve(d3.curveMonotoneX);

    regions.forEach((region, i) => {
      const data = rows.filter(d => d.region === region);
      const panel = g.append('g').attr('transform', `translate(${i * (panelWidth + gap)},0)`);
      addGrid(panel, y, panelWidth);
      panel.append('path').datum(data).attr('class', 'small-line').attr('d', line);
      panel.append('line').attr('class', 'zero-line').attr('x2', panelWidth).attr('y1', y(0)).attr('y2', y(0));
      panel.append('g').attr('class', 'axis').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(4));
      if (i === 0) panel.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5));
      panel.append('text').attr('class', 'panel-title').attr('x', panelWidth / 2).attr('y', -12).attr('text-anchor', 'middle').text(data[0].regionLabel);
    });
    addAxisLabels(g, width, height, 'Year', 'SST anomaly (°C)');
  }

  drawLongitudeProfile(rows) {
    const summaries = d3.rollups(
      rows.filter(d => d.phase === 'El Niño'),
      values => d3.mean(values, d => d.anomaly),
      d => d.region,
      d => d.regionLabel,
      d => d.longitude
    ).map(([region, [[label, [[longitude, anomaly]]]]]) => ({ region, label, longitude, anomaly }))
      .sort((a, b) => d3.ascending(a.longitude, b.longitude));

    const { g, width, height } = createChart('#longitude-profile', 580, 370, { top: 28, right: 28, bottom: 70, left: 64 });
    const x = d3.scaleLinear().domain([135, 260]).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(summaries, d => d.anomaly)]).nice().range([height, 0]);

    addGrid(g, y, width);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}E`));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5));
    g.append('path').datum(summaries).attr('class', 'profile-line')
      .attr('d', d3.line().x(d => x(d.longitude)).y(d => y(d.anomaly)).curve(d3.curveMonotoneX));

    g.selectAll('circle')
      .data(summaries)
      .join('circle')
      .attr('class', 'profile-dot')
      .attr('cx', d => x(d.longitude))
      .attr('cy', d => y(d.anomaly))
      .attr('r', 6)
      .attr('fill', d => this.color(-d.anomaly))
      .on('mousemove', (event, d) => this.showTooltip(event, `<strong>${d.label}</strong><br>${d.longitude}E<br>${d.anomaly.toFixed(2)}°C average in El Nino-like months`))
      .on('mouseleave', () => this.hideTooltip());

    addAxisLabels(g, width, height, 'Longitude across the equatorial Pacific', 'Average SST anomaly (°C)');
  }

  drawPrototype(rows, filters) {
    const byDate = rows.filter(d => d.date === filters.date);
    const filtered = byDate
      .filter(d => filters.phase === 'all' || d.phase === filters.phase)
      .filter(d => filters.region === 'all' || d.region === filters.region)
      .sort((a, b) => d3.ascending(a.longitude, b.longitude));

    const { g, width, height } = createChart('#prototype', 580, 430, { top: 42, right: 28, bottom: 124, left: 64 });
    const x = d3.scaleLinear().domain([135, 260]).range([0, width]);
    const y = d3.scaleLinear().domain([-2.6, 2.6]).range([height, 0]);

    addGrid(g, y, width);
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}E`));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5));
    g.append('line').attr('class', 'zero-line').attr('x2', width).attr('y1', y(0)).attr('y2', y(0));

    if (!filtered.length) {
      g.append('text').attr('class', 'empty').attr('x', width / 2).attr('y', height / 2).attr('text-anchor', 'middle')
      .text('No selected region matches this phase in this month.');
      return;
    }

    if (filtered.length > 1) {
      g.append('path').datum(filtered).attr('class', 'prototype-line')
        .attr('d', d3.line().x(d => x(d.longitude)).y(d => y(d.anomaly)).curve(d3.curveMonotoneX));
    }

    g.selectAll('circle')
      .data(filtered)
      .join('circle')
      .attr('class', 'prototype-dot')
      .attr('cx', d => x(d.longitude))
      .attr('cy', d => y(d.anomaly))
      .attr('r', 12)
      .attr('fill', d => this.color(-d.anomaly))
      .on('mousemove', (event, d) => this.showTooltip(event, tooltipHTML(d)))
      .on('mouseleave', () => this.hideTooltip());

    g.selectAll('.point-label')
      .data(filtered)
      .join('text')
      .attr('class', 'point-label')
      .attr('x', d => x(d.longitude))
      .attr('y', d => y(d.anomaly) - 18)
      .attr('text-anchor', 'middle')
      .text(d => d.region === 'nino_34' ? 'Nino 3.4' : d.regionLabel.replace(' Pacific', ''));

    g.append('text').attr('class', 'prototype-title').attr('x', 0).attr('y', -13)
      .text(`${formatMonth(filters.date)} - ${byDate[0].phase}`);
    addAxisLabels(g, width, height, 'Longitude across the equatorial Pacific', 'SST anomaly (°C)');
    this.addAnomalyLegend(g, 0, height + 78, width);
  }

  addAnomalyLegend(g, x, y, width) {
    const id = `legend-${Math.random().toString(16).slice(2)}`;
    const gradient = g.append('defs').append('linearGradient').attr('id', id);
    d3.range(0, 1.01, 0.1).forEach(t => {
      gradient.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', this.color(2.5 - t * 5));
    });
    const legendWidth = Math.min(260, width);
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

  addRegionLegend(g, x, y, labels) {
    const itemWidth = 118;
    const legend = g.append('g').attr('class', 'region-legend').attr('transform', `translate(${x},${y})`);
    legend.append('text').attr('class', 'legend-title').attr('x', 0).attr('y', -12).text('Pacific region');
    labels.forEach((label, index) => {
      const item = legend.append('g').attr('transform', `translate(${index * itemWidth},0)`);
      item.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', this.regionColor(label));
      item.append('text').attr('class', 'legend-label').attr('x', 15).attr('y', 10).text(label.replace(' Pacific', ''));
    });
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
  g.append('text').attr('class', 'axis-label').attr('x', width / 2).attr('y', height + 42).attr('text-anchor', 'middle').text(xLabel);
  g.append('text').attr('class', 'axis-label').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -40).attr('text-anchor', 'middle').text(yLabel);
}

function parseDate(date) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function formatMonth(date) {
  return d3.utcFormat('%b %Y')(parseDate(date));
}

function tooltipHTML(d) {
  return `
    <strong>${formatMonth(d.date)}</strong><br>
    ${d.regionLabel}: <strong>${d.anomaly.toFixed(2)}°C</strong><br>
    Phase: ${d.phase}<br>
    Point: ${d.latitude}N, ${d.longitude}E
  `;
}
