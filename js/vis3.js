/**
 * vis3.js — Matthew Paoletta
 * "Where does El Niño warm the world?"
 *
 * Animated world map: 5 key regions shown as circles whose COLOR encodes
 * how much warmer or cooler each region is vs. its own 1990–2024 mean.
 *   Blue  = cooler than average  (La Niña signature)
 *   Red   = warmer than average  (El Niño signature)
 *
 * Interactions:
 *   • Slider — scrub through each year 1990–2024
 *   • Play / Pause — auto-animate at ~1 year/sec
 *   • Hover a circle — tooltip showing annual avg temp, anomaly, regional mean
 *
 * Data: NASA POWER API (T2M monthly), NOAA ONI CSV, Natural Earth (world-atlas)
 */

(function () {
  // ── Regions ──────────────────────────────────────────────────────
  const REGIONS = [
    { name: "Niño 3.4 (Pacific)", short: "Niño 3.4", lat:   0, lon: -150 },
    { name: "Peru (S. America)",  short: "Peru",      lat: -10, lon:  -75 },
    { name: "Australia",          short: "Australia", lat: -25, lon:  135 },
    { name: "India",              short: "India",     lat:  20, lon:   80 },
    { name: "East Africa",        short: "E. Africa", lat:   0, lon:   38 },
  ];

  const START = 1990, END = 2024;

  // ── Setup ─────────────────────────────────────────────────────────
  const container = d3.select("#vis-3");
  container.select(".placeholder").remove();

  const loadMsg = container.append("p")
    .style("text-align", "center")
    .style("color", "#888")
    .style("padding", "2rem 0")
    .text("Loading NASA + map data…");

  function powerUrl(lat, lon) {
    return (
      "https://power.larc.nasa.gov/api/temporal/monthly/point" +
      `?parameters=T2M&community=RE` +
      `&longitude=${lon}&latitude=${lat}` +
      `&start=${START}&end=${END}&format=JSON`
    );
  }

  // Annual steps for the slider (one per year)
  const years = d3.range(START, END + 1); // [1990, 1991, … 2024]

  // All monthly keys used internally for averaging
  const months = [];
  for (let y = START; y <= END; y++) {
    for (let m = 1; m <= 12; m++) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }

  // ── Fetch all data in parallel ────────────────────────────────────
  Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
    ...REGIONS.map(r => d3.json(powerUrl(r.lat, r.lon))),
    d3.csv("data/oni.csv"),
  ]).then(([world, ...rest]) => {
    loadMsg.remove();

    const powerResults = rest.slice(0, REGIONS.length);
    const oniRows      = rest[REGIONS.length];

    // ── ONI map ───────────────────────────────────────────────────
    const oniMap = {};
    const seasonMid = {
      DJF: 1, JFM: 2, FMA: 3, MAM: 4, AMJ: 5, MJJ: 6,
      JJA: 7, JAS: 8, ASO: 9, SON: 10, OND: 11, NDJ: 12,
    };
    oniRows.forEach(row => {
      const mo = seasonMid[row.season];
      if (!mo) return;
      oniMap[`${row.year}-${String(mo).padStart(2, "0")}`] = +row.anomaly;
    });

    // ── Parse NASA POWER → monthly byKey, then annual averages ────
    const regionData = powerResults.map((resp, i) => {
      const raw = resp.properties.parameter.T2M;
      // Monthly lookup
      const monthly = {};
      Object.entries(raw).forEach(([k, v]) => {
        if (k.endsWith("13")) return; // skip annual summary row
        monthly[`${k.slice(0, 4)}-${k.slice(4, 6)}`] = (v === -999 ? null : v);
      });
      // Annual averages — one value per year
      const byYear = {};
      years.forEach(y => {
        const vals = d3.range(1, 13)
          .map(m => monthly[`${y}-${String(m).padStart(2, "0")}`])
          .filter(v => v != null);
        byYear[y] = vals.length ? d3.mean(vals) : null;
      });
      return { region: REGIONS[i], monthly, byYear };
    });

    // Long-term mean = mean of annual averages
    regionData.forEach(rd => {
      const vals = years.map(y => rd.byYear[y]).filter(v => v != null);
      rd.mean = d3.mean(vals);
    });

    // ── Controls ──────────────────────────────────────────────────
    const totalW = Math.min((container.node().clientWidth || 900), 960);
    const totalH = 460;

    const ctrlDiv = container.append("div")
      .style("padding", "0.5rem 1rem 0.25rem")
      .style("display", "flex")
      .style("align-items", "center")
      .style("gap", "0.75rem")
      .style("flex-wrap", "wrap");

    let playing = false, timer = null;

    const playBtn = ctrlDiv.append("button")
      .text("▶ Play")
      .style("padding", "0.2rem 0.85rem")
      .style("border", "1px solid #bbb")
      .style("border-radius", "4px")
      .style("cursor", "pointer")
      .style("font-size", "0.85rem")
      .style("background", "#fff")
      .style("color", "#333");

    const yearLabel = ctrlDiv.append("span")
      .style("font-size", "1.05rem")
      .style("font-weight", "700")
      .style("color", "#222")
      .style("min-width", "50px");

    const slider = ctrlDiv.append("input")
      .attr("type", "range")
      .attr("min", 0)
      .attr("max", years.length - 1)
      .attr("value", 0)
      .style("flex", "1")
      .style("min-width", "200px");

    const badge = ctrlDiv.append("span")
      .style("font-size", "0.78rem")
      .style("padding", "0.15rem 0.6rem")
      .style("border-radius", "4px")
      .style("font-weight", "700")
      .style("min-width", "72px")
      .style("text-align", "center");

    // ── SVG ───────────────────────────────────────────────────────
    const svg = container.append("svg")
      .attr("width", totalW)
      .attr("height", totalH);

    // Ocean
    svg.append("rect")
      .attr("width", totalW).attr("height", totalH)
      .attr("fill", "#c8e4f2");

    const projection = d3.geoNaturalEarth1()
      .scale(totalW / 6.4)
      .translate([totalW / 2, totalH / 2 + 15]);

    const pathGen = d3.geoPath().projection(projection);

    // Graticule
    svg.append("path")
      .datum(d3.geoGraticule()())
      .attr("d", pathGen)
      .attr("fill", "none")
      .attr("stroke", "#a8cfe0")
      .attr("stroke-width", 0.4);

    // Countries fill
    const countries = topojson.feature(world, world.objects.countries);
    svg.append("g").selectAll("path")
      .data(countries.features)
      .join("path")
        .attr("d", pathGen)
        .attr("fill", "#e6ead8")
        .attr("stroke", "none");

    // Country borders
    svg.append("path")
      .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b))
      .attr("d", pathGen)
      .attr("fill", "none")
      .attr("stroke", "#aaa")
      .attr("stroke-width", 0.35);

    // ── Color scale ───────────────────────────────────────────────
    // Blue = cold anomaly, Red = warm anomaly (flipped RdBu)
    const anomalyColor = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t))
      .domain([-3, 0, 3])
      .clamp(true);

    // ── Region circles ────────────────────────────────────────────
    const R = 34; // circle radius in px

    const circleG = svg.append("g");

    const circles = circleG.selectAll("circle")
      .data(regionData)
      .join("circle")
        .attr("cx", d => projection([d.region.lon, d.region.lat])[0])
        .attr("cy", d => projection([d.region.lon, d.region.lat])[1])
        .attr("r", R)
        .attr("stroke", "#333")
        .attr("stroke-width", 1.8)
        .attr("fill", "#ccc")
        .style("cursor", "pointer");

    // Short name labels beneath each circle
    circleG.selectAll("text.rlabel")
      .data(regionData)
      .join("text")
        .attr("class", "rlabel")
        .attr("x", d => projection([d.region.lon, d.region.lat])[0])
        .attr("y", d => projection([d.region.lon, d.region.lat])[1] + R + 13)
        .attr("text-anchor", "middle")
        .attr("font-size", "0.67rem")
        .attr("font-weight", "600")
        .attr("fill", "#222")
        .attr("pointer-events", "none")
        .text(d => d.region.short);

    // ── Tooltip ───────────────────────────────────────────────────
    const tooltip = d3.select("body").append("div")
      .style("position", "fixed")
      .style("background", "rgba(15,15,15,0.88)")
      .style("color", "#fff")
      .style("padding", "0.45rem 0.75rem")
      .style("border-radius", "6px")
      .style("font-size", "0.82rem")
      .style("line-height", "1.55")
      .style("pointer-events", "none")
      .style("display", "none")
      .style("z-index", "9999");

    circles
      .on("mousemove", function (event, d) {
        const yr   = years[+slider.property("value")];
        const temp = d.byYear[yr];
        const anom = temp != null ? temp - d.mean : null;
        const sign = anom > 0 ? "+" : "";
        tooltip
          .style("display", "block")
          .style("left", `${event.clientX + 14}px`)
          .style("top",  `${event.clientY - 36}px`)
          .html(
            `<strong>${d.region.name}</strong><br>` +
            `${yr} annual avg: ${temp != null ? temp.toFixed(1) + "°C" : "N/A"}<br>` +
            `Anomaly: ${anom != null ? sign + anom.toFixed(2) + "°C" : "N/A"}<br>` +
            `<span style="opacity:0.7;font-size:0.75rem">vs. 1990–2024 mean (${d.mean.toFixed(1)}°C)</span>`
          );
      })
      .on("mouseleave", () => tooltip.style("display", "none"));

    // ── Color legend ──────────────────────────────────────────────
    const legendW = 170, legendH = 11;
    const legendG = svg.append("g")
      .attr("transform", `translate(${totalW - legendW - 14}, ${totalH - 40})`);

    const defs = svg.append("defs");
    const grad = defs.append("linearGradient").attr("id", "vis3-anom-grad");
    [0, 0.25, 0.5, 0.75, 1].forEach(t => {
      grad.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", d3.interpolateRdBu(1 - t));
    });

    legendG.append("rect")
      .attr("width", legendW).attr("height", legendH)
      .attr("fill", "url(#vis3-anom-grad)")
      .attr("rx", 2)
      .attr("stroke", "#999").attr("stroke-width", 0.5);

    [["−3°C", 0, "start"], ["0", legendW / 2, "middle"], ["+3°C", legendW, "end"]]
      .forEach(([txt, x, anchor]) => {
        legendG.append("text")
          .attr("x", x).attr("y", legendH + 12)
          .attr("text-anchor", anchor)
          .attr("font-size", "0.64rem")
          .attr("fill", "#333")
          .text(txt);
      });

    legendG.append("text")
      .attr("x", legendW / 2).attr("y", -4)
      .attr("text-anchor", "middle")
      .attr("font-size", "0.64rem")
      .attr("fill", "#555")
      .text("Temp anomaly vs. regional 1990–2024 mean");

    // ── Update function (one step = one year) ────────────────────
    function update(idx) {
      const yr = years[idx];
      yearLabel.text(yr);

      // ONI: classify year by majority of monthly anomalies
      let elNinoCount = 0, laNinaCount = 0;
      months
        .filter(k => k.startsWith(String(yr)))
        .forEach(k => {
          const a = oniMap[k];
          if (a >= 0.5)  elNinoCount++;
          if (a <= -0.5) laNinaCount++;
        });
      if (elNinoCount >= 5) {
        badge.text("El Niño").style("background", "#ffe0de").style("color", "#900");
      } else if (laNinaCount >= 5) {
        badge.text("La Niña").style("background", "#dde8ff").style("color", "#003");
      } else {
        badge.text("Neutral").style("background", "#eee").style("color", "#555");
      }

      circles
        .transition().duration(500)
        .attr("fill", d => {
          const temp = d.byYear[yr];
          return temp != null ? anomalyColor(temp - d.mean) : "#ccc";
        });
    }

    slider.on("input", function () { update(+this.value); });

    playBtn.on("click", function () {
      playing = !playing;
      playBtn.text(playing ? "⏸ Pause" : "▶ Play");
      if (playing) {
        let idx = +slider.property("value");
        timer = setInterval(() => {
          idx = idx + 1;
          if (idx >= years.length) {
            playing = false;
            clearInterval(timer);
            playBtn.text("▶ Play");
            return;
          }
          slider.property("value", idx);
          update(idx);
        }, 700); // ~1 year per second
      } else {
        clearInterval(timer);
      }
    });

    update(0);

  }).catch(err => {
    loadMsg.text("Error loading data — " + err.message);
    console.error("vis3 error:", err);
  });
})();
