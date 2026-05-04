/**
 * vis4.js — Matthew Paoletta
 * "How does El Niño flip rainfall patterns?"
 *
 * Data: NASA POWER API (PRECTOTCORR — monthly precipitation, mm/day)
 *       NOAA ONI CSV (El Niño / La Niña shading)
 * Interactions:
 *   • Click legend items to show / hide individual region lines
 *   • Brush on the overview (bottom mini-chart) to zoom the main chart
 *   • Hover anywhere on chart for a tooltip showing all visible regions
 */

(function () {
  // ── Regions ────────────────────────────────────────────────────
  const REGIONS = [
    { name: "Niño 3.4 (Pacific)", lat:   0, lon: -150, color: "#e63946" },
    { name: "Peru (S. America)",  lat: -10, lon:  -75, color: "#f4a261" },
    { name: "Australia",          lat: -25, lon:  135, color: "#2a9d8f" },
    { name: "India",              lat:  20, lon:   80, color: "#457b9d" },
    { name: "East Africa",        lat:   0, lon:   38, color: "#6a4c93" },
  ];

  const START = 1990, END = 2024;

  // ── Container ──────────────────────────────────────────────────
  const container = d3.select("#vis-4");
  container.select(".placeholder").remove();

  const loadMsg = container.append("p")
    .style("text-align", "center")
    .style("color", "#888")
    .style("padding", "2rem 0")
    .text("Loading NASA data…");

  // ── Layout ─────────────────────────────────────────────────────
  const margin  = { top: 20, right: 160, bottom: 30, left: 55 };
  const margin2 = { top: 0,  right: 160, bottom: 20, left: 55 };
  const totalW  = container.node().clientWidth || 900;
  const totalH  = 500;
  const H1 = 310, H2 = 60;
  const W  = totalW - margin.left - margin.right;

  const svg = container.append("svg")
    .attr("width", totalW)
    .attr("height", totalH);

  svg.append("defs").append("clipPath").attr("id", "vis4-clip")
    .append("rect").attr("width", W).attr("height", H1);

  const focus   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const context = svg.append("g").attr("transform", `translate(${margin2.left},${margin.top + H1 + 60})`);

  // ── Fetch ──────────────────────────────────────────────────────
  function powerUrl(lat, lon) {
    return (
      "https://power.larc.nasa.gov/api/temporal/monthly/point" +
      `?parameters=PRECTOTCORR&community=RE` +
      `&longitude=${lon}&latitude=${lat}` +
      `&start=${START}&end=${END}&format=JSON`
    );
  }

  Promise.all([
    ...REGIONS.map(r => d3.json(powerUrl(r.lat, r.lon))),
    d3.csv("data/oni.csv"),
  ]).then(results => {
    loadMsg.remove();

    const powerResults = results.slice(0, REGIONS.length);

    // ── ONI map ───────────────────────────────────────────────────
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

    // ── Parse precipitation ───────────────────────────────────────
    const regionData = powerResults.map((resp, i) => {
      const raw = resp.properties.parameter.PRECTOTCORR;
      return Object.entries(raw)
        .filter(([k]) => !k.endsWith("13"))
        .map(([k, v]) => ({
          date:   new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, 1),
          key:    `${k.slice(0, 4)}-${k.slice(4, 6)}`,
          precip: v === -999 ? null : v,
        }))
        .filter(d => d.precip !== null);
    });

    const allDates = regionData[0].map(d => d.date);

    // ── Scales ────────────────────────────────────────────────────
    const x  = d3.scaleTime().domain(d3.extent(allDates)).range([0, W]);
    const x2 = d3.scaleTime().domain(d3.extent(allDates)).range([0, W]);

    const globalMax = d3.max(regionData, rd => d3.max(rd, d => d.precip));
    const y  = d3.scaleLinear().domain([0, globalMax * 1.1]).nice().range([H1, 0]);
    const y2 = d3.scaleLinear().domain([0, globalMax * 1.1]).nice().range([H2, 0]);

    // ── ENSO background bands ─────────────────────────────────────
    const bandG = focus.append("g").attr("clip-path", "url(#vis4-clip)");
    const bandRects = [];
    allDates.forEach(date => {
      const key  = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const anom = oniMap[key];
      if (anom === undefined) return;
      const color = anom >= 0.5 ? "#ffe8e8" : anom <= -0.5 ? "#e8f0ff" : null;
      if (!color) return;
      bandRects.push(
        bandG.append("rect").datum(date)
          .attr("x", x(date))
          .attr("width", Math.max(1, W / allDates.length))
          .attr("y", 0).attr("height", H1)
          .attr("fill", color).attr("opacity", 0.6)
      );
    });

    // ── Axes ──────────────────────────────────────────────────────
    const xAxisG = focus.append("g").attr("class", "axis")
      .attr("transform", `translate(0,${H1})`);
    const yAxisG = focus.append("g").attr("class", "axis");

    function renderAxes(xScale) {
      xAxisG.call(d3.axisBottom(xScale).ticks(d3.timeYear.every(2)));
      yAxisG.call(d3.axisLeft(y).ticks(6));
    }
    renderAxes(x);

    focus.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -H1 / 2).attr("y", -42)
      .attr("text-anchor", "middle").attr("font-size", "0.8rem").attr("fill", "#555")
      .text("Precipitation (mm/day)");

    // ── Lines ─────────────────────────────────────────────────────
    const makeLine = xScale => d3.line()
      .defined(d => d.precip !== null)
      .x(d => xScale(d.date))
      .y(d => y(d.precip));

    const makeLine2 = d3.line()
      .defined(d => d.precip !== null)
      .x(d => x2(d.date))
      .y(d => y2(d.precip));

    const focusPaths = regionData.map((rd, i) =>
      focus.append("path")
        .datum(rd)
        .attr("fill", "none")
        .attr("stroke", REGIONS[i].color)
        .attr("stroke-width", 1.8)
        .attr("clip-path", "url(#vis4-clip)")
        .attr("d", makeLine(x))
    );

    const contextPaths = regionData.map((rd, i) =>
      context.append("path")
        .datum(rd)
        .attr("fill", "none")
        .attr("stroke", REGIONS[i].color)
        .attr("stroke-width", 1)
        .attr("d", makeLine2)
    );

    // ── Context axis ──────────────────────────────────────────────
    context.append("g").attr("class", "axis")
      .attr("transform", `translate(0,${H2})`)
      .call(d3.axisBottom(x2).ticks(d3.timeYear.every(5)));

    // ── Brush ─────────────────────────────────────────────────────
    const brush = d3.brushX()
      .extent([[0, 0], [W, H2]])
      .on("brush end", ({ selection }) => {
        if (!selection) return;
        const [x0, x1] = selection.map(x2.invert);
        x.domain([x0, x1]);
        focusPaths.forEach(p => p.attr("d", makeLine(x)));
        renderAxes(x);
        bandRects.forEach(r => r.attr("x", d => x(d)));
      });

    context.append("g").attr("class", "brush").call(brush)
      .call(brush.move, x2.range());

    context.append("text")
      .attr("x", W / 2).attr("y", H2 + 18)
      .attr("text-anchor", "middle").attr("font-size", "0.75rem").attr("fill", "#888")
      .text("← drag handles to zoom");

    // ── Band legend (gap between charts) ──────────────────────────
    const bl = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top + H1 + 36})`);
    [["#ffe8e8", "El Niño (≥ +0.5°C)"], ["#e8f0ff", "La Niña (≤ −0.5°C)"]].forEach(([c, label], i) => {
      bl.append("rect").attr("x", i * 160).attr("y", 0).attr("width", 12).attr("height", 12).attr("fill", c).attr("stroke", "#ccc");
      bl.append("text").attr("x", i * 160 + 16).attr("y", 11).attr("font-size", "0.72rem").attr("fill", "#555").text(label);
    });

    // ── Clickable region legend (right of chart) ──────────────────
    const visible = REGIONS.map(() => true);

    const legendG = svg.append("g")
      .attr("transform", `translate(${margin.left + W + 14}, ${margin.top + 8})`);

    legendG.append("text")
      .attr("x", 0).attr("y", 0)
      .attr("font-size", "0.68rem").attr("fill", "#999").attr("font-weight", "600")
      .text("Click to toggle");

    REGIONS.forEach((r, i) => {
      const row = legendG.append("g")
        .attr("transform", `translate(0, ${i * 24 + 14})`)
        .style("cursor", "pointer")
        .on("click", () => {
          visible[i] = !visible[i];
          focusPaths[i].transition().duration(200).attr("opacity", visible[i] ? 1 : 0.08);
          contextPaths[i].transition().duration(200).attr("opacity", visible[i] ? 1 : 0.08);
          row.select("line").attr("stroke", visible[i] ? r.color : "#ccc");
          row.select("text").attr("fill", visible[i] ? "#333" : "#bbb");
        });

      row.append("line")
        .attr("x1", 0).attr("x2", 20).attr("y1", 7).attr("y2", 7)
        .attr("stroke", r.color).attr("stroke-width", 2.5);

      row.append("text")
        .attr("x", 25).attr("y", 11)
        .attr("font-size", "0.74rem").attr("fill", "#333")
        .text(r.name);
    });

    // ── Tooltip ───────────────────────────────────────────────────
    const tip = container.append("div")
      .style("position", "absolute")
      .style("background", "rgba(15,15,15,0.88)")
      .style("color", "#fff")
      .style("padding", "0.45rem 0.7rem")
      .style("border-radius", "5px")
      .style("font-size", "0.78rem")
      .style("pointer-events", "none")
      .style("display", "none")
      .style("line-height", "1.7");

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

        const rows = regionData
          .map((rd, i) => {
            if (!visible[i]) return null;
            const idx = bisect(rd, date, 1);
            const pt  = rd[Math.min(idx, rd.length - 1)];
            return pt ? { name: REGIONS[i].name, color: REGIONS[i].color, precip: pt.precip } : null;
          })
          .filter(Boolean)
          .sort((a, b) => b.precip - a.precip);

        tip.style("display", "block")
          .html(
            `<strong>${date.toLocaleDateString("en-US", { year: "numeric", month: "short" })}</strong> ` +
            `<span style="opacity:0.65">(${status})</span><br/>` +
            rows.map(r =>
              `<span style="color:${r.color}">■</span> ${r.name}: <strong>${r.precip.toFixed(2)}</strong> mm/day`
            ).join("<br/>")
          )
          .style("left", (event.offsetX + 15) + "px")
          .style("top",  (event.offsetY - 20) + "px");
      })
      .on("mouseleave", () => tip.style("display", "none"));

  }).catch(err => {
    loadMsg.text("⚠ Failed to load NASA data. Run a local server: python -m http.server 8000");
    console.error("vis4 error:", err);
  });
})();
