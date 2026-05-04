/**
 * vis4.js — Matthew Paoletta
 * "How does El Niño flip rainfall patterns?"
 *
 * Data: NASA POWER API (PRECTOTCORR — monthly precipitation, mm/day)
 *       NOAA ONI text file (El Niño event shading)
 * Interactions:
 *   • Dropdown to switch between regions
 *   • Brush on the overview (bottom mini-chart) to zoom the main chart
 *   • Hover tooltip showing precipitation + El Niño status
 */

(function () {
  // ── Regions ────────────────────────────────────────────────────
  const REGIONS = [
    { name: "Niño 3.4 (Pacific)",  lat:   0, lon: -150, color: "#e63946" },
    { name: "Peru (S. America)",   lat: -10, lon:  -75, color: "#f4a261" },
    { name: "Australia",           lat: -25, lon:  135, color: "#2a9d8f" },
    { name: "India",               lat:  20, lon:   80, color: "#457b9d" },
    { name: "East Africa",         lat:   0, lon:   38, color: "#6a4c93" },
  ];

  const START = 1990, END = 2024;

  // ── Container ──────────────────────────────────────────────────
  const container = d3.select("#vis-4");
  container.select(".placeholder").remove();

  // Dropdown
  const controls = container.append("div")
    .style("padding", "0.6rem 1rem 0")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "0.75rem");

  controls.append("label")
    .attr("for", "vis4-region")
    .style("font-size", "0.85rem")
    .style("color", "#444")
    .text("Region:");

  const select = controls.append("select")
    .attr("id", "vis4-region")
    .style("font-size", "0.85rem")
    .style("padding", "0.2rem 0.5rem")
    .style("border-radius", "4px")
    .style("border", "1px solid #ccc");

  REGIONS.forEach(r => select.append("option").attr("value", r.name).text(r.name));

  // Loading indicator
  const loadMsg = container.append("p")
    .attr("class", "vis-loading")
    .style("text-align", "center")
    .style("color", "#888")
    .text("Loading NASA data…");

  // ── Layout ─────────────────────────────────────────────────────
  const margin  = { top: 20, right: 20, bottom: 30, left: 55 };
  const margin2 = { top: 0,  right: 20, bottom: 20, left: 55 };
  const totalW  = container.node().clientWidth || 900;
  const totalH  = 500;
  const H1 = 310, H2 = 60;
  const W  = totalW - margin.left - margin.right;

  const svg = container.append("svg")
    .attr("width", totalW)
    .attr("height", totalH);

  // Clip path so lines don't overflow during brush zoom
  svg.append("defs").append("clipPath").attr("id", "vis4-clip")
    .append("rect").attr("width", W).attr("height", H1);

  const focus   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const context = svg.append("g").attr("transform", `translate(${margin2.left},${margin.top + H1 + 60})`);

  // ── Fetch helpers ──────────────────────────────────────────────
  function powerUrl(lat, lon) {
    return (
      "https://power.larc.nasa.gov/api/temporal/monthly/point" +
      `?parameters=PRECTOTCORR&community=RE` +
      `&longitude=${lon}&latitude=${lat}` +
      `&start=${START}&end=${END}&format=JSON`
    );
  }

  const ONI_URL = "data/oni.csv";

  // ── Load everything ────────────────────────────────────────────
  Promise.all([
    ...REGIONS.map(r => d3.json(powerUrl(r.lat, r.lon))),
    d3.csv(ONI_URL),
  ]).then(results => {
    loadMsg.remove();

    const powerResults = results.slice(0, REGIONS.length);

    // Parse ONI CSV
    const oniMap = {};
    results[results.length - 1].forEach(row => {
      const seasonMid = {
        DJF: 1, JFM: 2, FMA: 3, MAM: 4, AMJ: 5, MJJ: 6,
        JJA: 7, JAS: 8, ASO: 9, SON: 10, OND: 11, NDJ: 12,
      };
      const mo = seasonMid[row.season];
      if (!mo) return;
      oniMap[`${row.year}-${String(mo).padStart(2, "0")}`] = +row.anomaly;
    });

    // Parse POWER precipitation
    const regionData = powerResults.map((resp, i) => {
      const raw = resp.properties.parameter.PRECTOTCORR;
      return Object.entries(raw)
        .map(([k, v]) => ({
          region: REGIONS[i].name,
          date:   new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, 1),
          key:    k.slice(0, 4) + "-" + k.slice(4, 6),
          precip: v === -999 ? null : v,
        }))
        .filter(d => d.precip !== null);
    });

    const allDates = regionData[0].map(d => d.date);

    // ── Scales ──────────────────────────────────────────────────
    const x  = d3.scaleTime().domain(d3.extent(allDates)).range([0, W]);
    const x2 = d3.scaleTime().domain(d3.extent(allDates)).range([0, W]);

    function yDomain(rd) {
      return [0, d3.max(rd, d => d.precip) * 1.1];
    }

    let activeRegion = 0;
    const y  = d3.scaleLinear().domain(yDomain(regionData[0])).nice().range([H1, 0]);
    const y2 = d3.scaleLinear().domain(yDomain(regionData[0])).nice().range([H2, 0]);

    // ── El Niño bands (focus) ────────────────────────────────────
    const bandG = focus.append("g").attr("clip-path", "url(#vis4-clip)");

    allDates.forEach(date => {
      const key  = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const anom = oniMap[key];
      if (anom === undefined) return;
      const color = anom >= 0.5 ? "#ffe8e8" : anom <= -0.5 ? "#e8f0ff" : null;
      if (!color) return;
      bandG.append("rect")
        .attr("x", x(date))
        .attr("width", Math.max(1, W / allDates.length))
        .attr("y", 0).attr("height", H1)
        .attr("fill", color).attr("opacity", 0.6);
    });

    // ── Axes (focus) ─────────────────────────────────────────────
    const xAxisG = focus.append("g").attr("class", "axis")
      .attr("transform", `translate(0,${H1})`);
    const yAxisG = focus.append("g").attr("class", "axis");

    function renderAxes(xScale) {
      xAxisG.call(d3.axisBottom(xScale).ticks(d3.timeYear.every(2)));
      yAxisG.call(d3.axisLeft(y).ticks(5));
    }
    renderAxes(x);

    focus.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -H1 / 2).attr("y", -42)
      .attr("text-anchor", "middle").attr("font-size", "0.8rem").attr("fill", "#555")
      .text("Precipitation (mm/day)");

    // ── Lines ────────────────────────────────────────────────────
    const lineGen = (xScale) => d3.line()
      .defined(d => d.precip !== null)
      .x(d => xScale(d.date))
      .y(d => y(d.precip));

    const lineGen2 = d3.line()
      .defined(d => d.precip !== null)
      .x(d => x2(d.date))
      .y(d => y2(d.precip));

    const focusPath = focus.append("path")
      .attr("fill", "none")
      .attr("stroke-width", 1.8)
      .attr("clip-path", "url(#vis4-clip)");

    const contextPath = context.append("path")
      .attr("fill", "none")
      .attr("stroke-width", 1);

    function drawRegion(idx, xScale) {
      const rd = regionData[idx];
      const color = REGIONS[idx].color;
      focusPath.datum(rd).attr("stroke", color).attr("d", lineGen(xScale));
      contextPath.datum(rd).attr("stroke", color).attr("d", lineGen2);
    }
    drawRegion(0, x);

    // ── Context axis ─────────────────────────────────────────────
    context.append("g").attr("class", "axis")
      .attr("transform", `translate(0,${H2})`)
      .call(d3.axisBottom(x2).ticks(d3.timeYear.every(5)));

    // ── Brush ────────────────────────────────────────────────────
    const brush = d3.brushX()
      .extent([[0, 0], [W, H2]])
      .on("brush end", ({ selection }) => {
        if (!selection) return;
        const [x0, x1] = selection.map(x2.invert);
        x.domain([x0, x1]);
        drawRegion(activeRegion, x);
        renderAxes(x);
        // Re-draw band positions
        bandG.selectAll("rect").attr("x", d => x(d));
      });

    context.append("g").attr("class", "brush").call(brush)
      .call(brush.move, x2.range());

    context.append("text")
      .attr("x", W / 2).attr("y", H2 + 18)
      .attr("text-anchor", "middle").attr("font-size", "0.75rem").attr("fill", "#888")
      .text("← drag handles to zoom");

    // ── Band legend (between focus and context) ─────────────────
    const bl = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top + H1 + 36})`);
    [["#ffe8e8","El Niño (≥ +0.5°C)"],["#e8f0ff","La Niña (≤ −0.5°C)"]].forEach(([c, label], i) => {
      bl.append("rect").attr("x", i * 160).attr("y", 0).attr("width", 12).attr("height", 12).attr("fill", c).attr("stroke", "#ccc");
      bl.append("text").attr("x", i * 160 + 16).attr("y", 11).attr("font-size", "0.72rem").attr("fill", "#555").text(label);
    });

    // ── Tooltip ──────────────────────────────────────────────────
    const tip = container.append("div")
      .style("position", "absolute")
      .style("background", "rgba(0,0,0,0.78)")
      .style("color", "#fff")
      .style("padding", "0.45rem 0.7rem")
      .style("border-radius", "4px")
      .style("font-size", "0.78rem")
      .style("pointer-events", "none")
      .style("display", "none")
      .style("line-height", "1.6");

    const bisect = d3.bisector(d => d.date).left;

    svg.append("rect")
      .attr("fill", "none").attr("pointer-events", "all")
      .attr("x", margin.left).attr("y", margin.top)
      .attr("width", W).attr("height", H1)
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event, this);
        const date = x.invert(mx - margin.left);
        const key  = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const anom = oniMap[key];
        const status = anom >= 0.5 ? "🔴 El Niño" : anom <= -0.5 ? "🔵 La Niña" : "Neutral";
        const rd  = regionData[activeRegion];
        const idx = bisect(rd, date, 1);
        const d   = rd[Math.min(idx, rd.length - 1)];
        const pre = d ? d.precip : null;

        tip.style("display", "block")
          .html(
            `<strong>${date.toLocaleDateString("en-US", { year: "numeric", month: "short" })}</strong>` +
            `<br/>ONI: ${anom !== undefined ? anom.toFixed(2) + "°C" : "—"} (${status})` +
            `<br/>${REGIONS[activeRegion].name}: ${pre !== null ? pre.toFixed(2) + " mm/day" : "—"}`
          )
          .style("left", (event.offsetX + 15) + "px")
          .style("top", (event.offsetY - 20) + "px");
      })
      .on("mouseleave", () => tip.style("display", "none"));

    // ── Dropdown handler ─────────────────────────────────────────
    select.on("change", function () {
      activeRegion = REGIONS.findIndex(r => r.name === this.value);
      y.domain(yDomain(regionData[activeRegion])).nice();
      yAxisG.transition().duration(300).call(d3.axisLeft(y).ticks(5));
      drawRegion(activeRegion, x);
    });

  }).catch(err => {
    loadMsg.text("⚠ Failed to load NASA data. Run a local server: python -m http.server 8000");
    console.error("vis4 error:", err);
  });
})();
