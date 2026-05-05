/**
 * vis5.js - Thomas Deitel
 * Exploratory graph: environmental indicators by region, 1990-2020.
 *
 * Interactions:
 *   - Buttons switch the environmental variable shown.
 *   - Hover/focus shows exact values for the nearest year.
 *   - Legend click toggles individual region lines when multiple regions exist.
 *
 * Data transformation:
 *   - Rows are grouped by variable, region, and year.
 *   - Duplicate rows are averaged before plotting.
 */

(function () {
  const container = d3.select("#vis-5");
  container.select(".placeholder").remove();

  const variableMeta = {
    temperature: { label: "Temperature", color: "#c64b37" },
    precipitation: { label: "Precipitation", color: "#2b7bbb" },
    co2: { label: "CO2", color: "#6d5b97" },
    sea_level: { label: "Sea level", color: "#2f8f83" },
  };

  const regionLabels = {
    north_america: "North America",
    europe: "Europe",
    asia: "Asia",
  };

  const regionColors = {
    north_america: "#1f77b4",
    europe: "#d95f02",
    asia: "#2ca02c",
  };

  const margin = { top: 28, right: 132, bottom: 58, left: 68 };
  const totalWidth = Math.min(container.node().clientWidth || 900, 960);
  const totalHeight = 470;
  const width = totalWidth - margin.left - margin.right;
  const height = totalHeight - margin.top - margin.bottom;

  const controls = container.append("div").attr("class", "vis5-controls");
  controls.append("span").attr("class", "vis5-control-label").text("Measure");

  const note = container.append("p")
    .attr("class", "vis5-note")
    .text("Grouped by year, region, and variable; duplicate observations are averaged before plotting.");

  const svg = container.append("svg")
    .attr("class", "vis5-svg")
    .attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`)
    .attr("role", "img")
    .attr("aria-label", "Interactive line chart of environmental indicators by region");

  svg.append("rect")
    .attr("class", "vis5-chart-bg")
    .attr("width", totalWidth)
    .attr("height", totalHeight)
    .attr("fill", "#fff");

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  svg.append("defs").append("clipPath")
    .attr("id", "vis5-clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleLinear().range([0, width]);
  const y = d3.scaleLinear().range([height, 0]);

  const xAxisG = g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`);
  const yAxisG = g.append("g").attr("class", "axis");
  const gridG = g.append("g").attr("class", "vis5-grid");
  const lineG = g.append("g")
    .attr("clip-path", "url(#vis5-clip)");
  const pointG = g.append("g");
  const legendG = g.append("g")
    .attr("transform", `translate(${width + 18}, 18)`);

  g.append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height + 44)
    .attr("text-anchor", "middle")
    .text("Year");

  const yLabel = g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -48)
    .attr("text-anchor", "middle");

  const hoverLine = g.append("line")
    .attr("class", "vis5-hover-line")
    .attr("y1", 0)
    .attr("y2", height)
    .style("display", "none");

  const tooltip = container.append("div")
    .attr("class", "vis5-tooltip")
    .style("opacity", 0);

  const overlay = g.append("rect")
    .attr("class", "vis5-overlay")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#fff")
    .attr("fill-opacity", 0)
    .attr("stroke", "none")
    .attr("pointer-events", "all")
    .style("pointer-events", "all");

  let activeVariable = "temperature";
  let visibleRegions = new Set();
  let groupedByVariable = new Map();

  d3.csv("data/environmental_subset.csv", parseRow).then(rawRows => {
    const rows = rawRows.filter(Boolean);
    const averaged = d3.rollups(
      rows,
      values => ({
        value: d3.mean(values, d => d.value),
        unit: values[0].unit,
        model: values[0].model,
      }),
      d => d.variable,
      d => d.region,
      d => d.year
    ).flatMap(([variable, byRegion]) =>
      byRegion.flatMap(([region, byYear]) =>
        byYear.map(([year, summary]) => ({
          variable,
          region,
          year,
          value: summary.value,
          unit: summary.unit,
          model: summary.model,
        }))
      )
    );

    groupedByVariable = d3.group(averaged, d => d.variable);

    const variables = Array.from(groupedByVariable.keys())
      .sort((a, b) => d3.ascending(labelForVariable(a), labelForVariable(b)));

    controls.selectAll("button")
      .data(variables)
      .join("button")
      .attr("type", "button")
      .attr("class", d => d === activeVariable ? "active" : null)
      .style("--accent", d => variableMeta[d]?.color || "#555")
      .text(d => labelForVariable(d))
      .on("click", (event, variable) => {
        activeVariable = variable;
        controls.selectAll("button").classed("active", d => d === activeVariable);
        resetVisibleRegions();
        render();
      });

    resetVisibleRegions();
    render();
  }).catch(err => {
    console.error(err);
    container.append("p")
      .attr("class", "vis5-error")
      .text("Could not load data/environmental_subset.csv. Run a local server if opening the page directly blocks CSV loading.");
  });

  function parseRow(d) {
    const year = +d.year;
    const value = +d.value;
    if (!Number.isFinite(year) || !Number.isFinite(value)) return null;
    return {
      year,
      value,
      variable: (d.variable || "").trim().toLowerCase(),
      region: (d.region || "").trim().toLowerCase(),
      unit: (d.unit || "").trim(),
      model: (d.model || "").trim(),
    };
  }

  function resetVisibleRegions() {
    const rows = groupedByVariable.get(activeVariable) || [];
    visibleRegions = new Set(Array.from(new Set(rows.map(d => d.region))));
  }

  function render() {
    const rows = groupedByVariable.get(activeVariable) || [];
    const series = Array.from(d3.group(rows, d => d.region), ([region, values]) => ({
      region,
      values: values.slice().sort((a, b) => d3.ascending(a.year, b.year)),
    })).sort((a, b) => d3.ascending(labelForRegion(a.region), labelForRegion(b.region)));

    const visibleSeries = series.filter(s => visibleRegions.has(s.region));
    const visibleRows = visibleSeries.flatMap(s => s.values);
    const unit = rows[0]?.unit || "";

    x.domain(d3.extent(rows, d => d.year));
    y.domain(paddedExtent(visibleRows.map(d => d.value))).nice();

    const transition = svg.transition().duration(450);
    xAxisG.transition(transition).call(
      d3.axisBottom(x).ticks(8).tickFormat(d3.format("d"))
    );
    yAxisG.transition(transition).call(d3.axisLeft(y).ticks(6));
    gridG.transition(transition).call(
      d3.axisLeft(y).ticks(6).tickSize(-width).tickFormat("")
    );

    yLabel.text(`${labelForVariable(activeVariable)}${unit ? ` (${unit})` : ""}`);

    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);

    lineG.selectAll(".vis5-line")
      .data(visibleSeries, d => d.region)
      .join(
        enter => enter.append("path")
          .attr("class", "vis5-line")
          .attr("fill", "none")
          .attr("stroke", d => regionColors[d.region] || "#555")
          .attr("stroke-width", 2.4)
          .attr("d", d => line(d.values))
          .attr("stroke-dasharray", function () {
            const length = this.getTotalLength();
            return `${length} ${length}`;
          })
          .attr("stroke-dashoffset", function () {
            return this.getTotalLength();
          })
          .call(enter => enter.transition(transition).attr("stroke-dashoffset", 0)),
        update => update
          .transition(transition)
          .attr("stroke", d => regionColors[d.region] || "#555")
          .attr("d", d => line(d.values)),
        exit => exit.transition(transition).style("opacity", 0).remove()
      );

    const pointRows = visibleRows.map(d => ({ ...d, key: `${d.region}-${d.year}` }));
    pointG.selectAll(".vis5-point")
      .data(pointRows, d => d.key)
      .join(
        enter => enter.append("circle")
          .attr("class", "vis5-point")
          .attr("r", 0)
          .attr("fill", d => regionColors[d.region] || "#555")
          .attr("cx", d => x(d.year))
          .attr("cy", d => y(d.value))
          .call(enter => enter.transition(transition).attr("r", 3.7)),
        update => update.transition(transition)
          .attr("fill", d => regionColors[d.region] || "#555")
          .attr("cx", d => x(d.year))
          .attr("cy", d => y(d.value)),
        exit => exit.transition(transition).attr("r", 0).remove()
      );

    renderLegend(series);
    bindHover(visibleRows, unit);
  }

  function renderLegend(series) {
    legendG.selectAll("*").remove();
    legendG.append("text")
      .attr("class", "vis5-legend-title")
      .attr("x", 0)
      .attr("y", -6)
      .text("Region");

    const item = legendG.selectAll(".vis5-legend-item")
      .data(series)
      .join("g")
      .attr("class", "vis5-legend-item")
      .attr("transform", (d, i) => `translate(0,${i * 25 + 14})`)
      .style("opacity", d => visibleRegions.has(d.region) ? 1 : 0.35)
      .on("click", (event, d) => {
        if (visibleRegions.has(d.region) && visibleRegions.size > 1) {
          visibleRegions.delete(d.region);
        } else {
          visibleRegions.add(d.region);
        }
        render();
      });

    item.append("circle")
      .attr("r", 5)
      .attr("fill", d => regionColors[d.region] || "#555");

    item.append("text")
      .attr("x", 12)
      .attr("y", 4)
      .text(d => labelForRegion(d.region));
  }

  function bindHover(rows, unit) {
    const years = Array.from(new Set(rows.map(d => d.year))).sort(d3.ascending);
    const bisect = d3.bisector(d => d).center;

    overlay
      .on("mousemove", event => {
        if (!rows.length) return;
        const [mx] = d3.pointer(event, overlay.node());
        const year = years[bisect(years, x.invert(mx))];
        const atYear = rows
          .filter(d => d.year === year)
          .sort((a, b) => d3.ascending(labelForRegion(a.region), labelForRegion(b.region)));

        hoverLine
          .style("display", null)
          .attr("x1", x(year))
          .attr("x2", x(year));

        pointG.selectAll(".vis5-point")
          .attr("stroke", d => d.year === year ? "#222" : "none")
          .attr("stroke-width", d => d.year === year ? 1.5 : 0)
          .attr("r", d => d.year === year ? 5 : 3.7);

        tooltip
          .style("opacity", 1)
          .style("left", `${margin.left + x(year) + 12}px`)
          .style("top", `${margin.top + 18}px`)
          .html(`
            <strong>${year}</strong>
            ${atYear.map(d => `
              <div>
                <span style="background:${regionColors[d.region] || "#555"}"></span>
                ${labelForRegion(d.region)}: ${d3.format(".2~f")(d.value)} ${unit}
              </div>
            `).join("")}
          `);
      })
      .on("mouseleave", () => {
        hoverLine.style("display", "none");
        pointG.selectAll(".vis5-point")
          .attr("stroke", "none")
          .attr("r", 3.7);
        tooltip.style("opacity", 0);
      });
  }

  function paddedExtent(values) {
    const extent = d3.extent(values);
    if (!Number.isFinite(extent[0]) || !Number.isFinite(extent[1])) return [0, 1];
    const pad = (extent[1] - extent[0]) * 0.12 || Math.abs(extent[0]) * 0.05 || 1;
    return [extent[0] - pad, extent[1] + pad];
  }

  function labelForVariable(variable) {
    return variableMeta[variable]?.label || variable.replace(/_/g, " ");
  }

  function labelForRegion(region) {
    return regionLabels[region] || region.replace(/_/g, " ");
  }
})();
