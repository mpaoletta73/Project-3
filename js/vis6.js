/**
 * vis6.js — Gilad Segal
 * "How do El Niño winds impact the spread of wildfires?"
 *
 * Animated world map: month-by-month (2000–2024) showing
 *   • NASA GIBS WMS satellite imagery — MODIS fire detections or aerosol optical depth
 *   • Wind-direction arrows at 5 fire-prone regions (NASA POWER WS10M / WD10M)
 *   • Interactive ONI timeline scrubber (click any month to jump)
 *
 * Data: NASA GIBS WMS (MODIS Terra), NASA POWER API (wind), NOAA ONI CSV
 */

(function () {

  // ── Regions ──────────────────────────────────────────────────────
  const REGIONS = [
    { name: "Australia",        short: "AUS", lat: -25, lon:  135 },
    { name: "Indonesia/Borneo", short: "IDN", lat:   0, lon:  115 },
    { name: "W. USA",           short: "USA", lat:  37, lon: -120 },
    { name: "Amazon",           short: "AMZ", lat: -10, lon:  -55 },
    { name: "S. Africa",        short: "AFR", lat: -15, lon:   25 },
  ];

  const LAYER_FIRE    = "MODIS_Terra_Thermal_Anomalies_All";
  const LAYER_AEROSOL = "MODIS_Terra_Aerosol_Optical_Depth_v6_STD";
  const START = 2000, END = 2024;

  const seasonMid = {
    DJF: 1, JFM: 2, FMA: 3, MAM: 4, AMJ: 5, MJJ: 6,
    JJA: 7, JAS: 8, ASO: 9, SON: 10, OND: 11, NDJ: 12,
  };

  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun",
                       "Jul","Aug","Sep","Oct","Nov","Dec"];

  // ── Container setup ──────────────────────────────────────────────
  const container = d3.select("#vis-6");
  container.select(".placeholder").remove();

  const loadMsg = container.append("p")
    .style("text-align", "center")
    .style("color", "#8899aa")
    .style("padding", "2.5rem 0")
    .style("background", "#07121e")
    .style("margin", "0")
    .text("Loading NASA fire & wind data…");

  // ── URL helpers ──────────────────────────────────────────────────
  function powerUrl(lat, lon) {
    return (
      "https://power.larc.nasa.gov/api/temporal/monthly/point" +
      `?parameters=WS10M,WD10M&community=RE` +
      `&longitude=${lon}&latitude=${lat}` +
      `&start=${START}&end=${END}&format=JSON`
    );
  }

  function gibsUrl(layer, dateStr, w, h) {
    return (
      "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi" +
      `?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1` +
      `&LAYERS=${encodeURIComponent(layer)}&TIME=${dateStr}` +
      `&WIDTH=${Math.round(w)}&HEIGHT=${Math.round(h)}` +
      `&FORMAT=image/png&BBOX=-180,-90,180,90&SRS=EPSG:4326`
    );
  }

  // ── Fetch all data in parallel ────────────────────────────────────
  Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
    d3.csv("data/oni.csv"),
    ...REGIONS.map(r => d3.json(powerUrl(r.lat, r.lon))),
  ]).then(([world, oniRows, ...powerResults]) => {
    loadMsg.remove();

    // ── ONI index (month → anomaly) ───────────────────────────────
    const oniByMonth = {};
    oniRows.forEach(row => {
      const mo = seasonMid[row.season];
      if (!mo) return;
      oniByMonth[`${row.year}-${String(mo).padStart(2, "0")}`] = +row.anomaly;
    });

    // ── Wind data (NASA POWER WS10M + WD10M) ─────────────────────
    const regionData = powerResults.map((resp, i) => {
      const rawWs = resp.properties.parameter.WS10M;
      const rawWd = resp.properties.parameter.WD10M;
      const windByMonth = {};
      Object.keys(rawWs).forEach(k => {
        if (k.endsWith("13")) return;
        const key = `${k.slice(0, 4)}-${k.slice(4, 6)}`;
        windByMonth[key] = {
          ws: rawWs[k] === -999 ? null : rawWs[k],
          wd: rawWd[k] === -999 ? null : rawWd[k],
        };
      });
      return { region: REGIONS[i], windByMonth };
    });

    // ── Frames (one per calendar month, 2000–2024) ────────────────
    const frames = [];
    for (let y = START; y <= END; y++) {
      for (let m = 1; m <= 12; m++) {
        const mStr = String(m).padStart(2, "0");
        const key  = `${y}-${mStr}`;
        frames.push({
          year: y, month: m,
          dateStr: `${y}-${mStr}-15`,
          key,
          oni: oniByMonth[key] ?? null,
        });
      }
    }

    // ── Layout ────────────────────────────────────────────────────
    const W     = Math.min(container.node().clientWidth || 960, 960);
    const mapH  = Math.round(W / 2);   // equirectangular = 2 : 1
    const tlH   = 88;
    const totalH = mapH + tlH;

    // ── Controls row ──────────────────────────────────────────────
    const ctrlDiv = container.append("div")
      .style("padding", "0.45rem 0.75rem 0.35rem")
      .style("display", "flex")
      .style("align-items", "center")
      .style("gap", "0.6rem")
      .style("flex-wrap", "wrap")
      .style("background", "#07121e")
      .style("border-bottom", "1px solid #162840");

    let playing     = false;
    let timer       = null;
    let activeLayer = LAYER_FIRE;
    let frameIdx    = frames.findIndex(f => f.year === 2015 && f.month === 9);
    if (frameIdx < 0) frameIdx = 0;

    const playBtn = ctrlDiv.append("button")
      .text("▶ Play")
      .style("padding", "0.2rem 0.8rem")
      .style("border", "1px solid #2a5070")
      .style("border-radius", "4px")
      .style("cursor", "pointer")
      .style("font-size", "0.82rem")
      .style("background", "#0d1b2a")
      .style("color", "#99bbdd");

    const dateLabel = ctrlDiv.append("span")
      .style("font-size", "1rem")
      .style("font-weight", "700")
      .style("color", "#fff")
      .style("min-width", "92px");

    const badge = ctrlDiv.append("span")
      .style("font-size", "0.75rem")
      .style("padding", "0.15rem 0.7rem")
      .style("border-radius", "4px")
      .style("font-weight", "700")
      .style("min-width", "68px")
      .style("text-align", "center");

    ctrlDiv.append("span").style("flex", "1");  // push layer btns to right

    const fireBtn = ctrlDiv.append("button")
      .text("🔥 Fire")
      .style("padding", "0.2rem 0.75rem")
      .style("border-radius", "4px")
      .style("cursor", "pointer")
      .style("font-size", "0.82rem");

    const smokeBtn = ctrlDiv.append("button")
      .text("🌫 Smoke")
      .style("padding", "0.2rem 0.75rem")
      .style("border-radius", "4px")
      .style("cursor", "pointer")
      .style("font-size", "0.82rem");

    function styleLayerBtns() {
      const f = activeLayer === LAYER_FIRE;
      fireBtn
        .style("border",      f ? "1px solid #e05040" : "1px solid #2a5070")
        .style("background",  f ? "#2a1212"           : "#0d1b2a")
        .style("color",       f ? "#e09070"           : "#668899");
      smokeBtn
        .style("border",      !f ? "1px solid #6090c0" : "1px solid #2a5070")
        .style("background",  !f ? "#121a2a"            : "#0d1b2a")
        .style("color",       !f ? "#8ab0d0"            : "#668899");
    }
    styleLayerBtns();

    // ── SVG ───────────────────────────────────────────────────────
    const svg = container.append("svg")
      .attr("width", W)
      .attr("height", totalH)
      .style("display", "block")
      .style("background", "#0d1b2a");

    const mapG = svg.append("g");

    // GIBS satellite tile (bottom layer — under country fills & borders)
    const gibsImg = mapG.append("image")
      .attr("x", 0).attr("y", 0)
      .attr("width", W).attr("height", mapH)
      .attr("preserveAspectRatio", "none")
      .attr("opacity", 0.88);

    // ── Projection: equirectangular aligns exactly with GIBS BBOX ──
    // GIBS BBOX -180,-90,180,90 maps to SVG [0,0]→[W,mapH]
    const projection = d3.geoEquirectangular()
      .scale(W / (2 * Math.PI))
      .translate([W / 2, mapH / 2]);
    const pathGen = d3.geoPath().projection(projection);

    // Graticule (faint grid)
    mapG.append("path")
      .datum(d3.geoGraticule()())
      .attr("d", pathGen)
      .attr("fill", "none")
      .attr("stroke", "#162840")
      .attr("stroke-width", 0.4);

    // Country fills (semi-transparent so GIBS imagery shows through)
    const countries = topojson.feature(world, world.objects.countries);
    mapG.append("g").selectAll("path")
      .data(countries.features)
      .join("path")
        .attr("d", pathGen)
        .attr("fill", "#0f1e30")
        .attr("opacity", 0.55)
        .attr("stroke", "none");

    // Country borders
    mapG.append("path")
      .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b))
      .attr("d", pathGen)
      .attr("fill", "none")
      .attr("stroke", "#2a5070")
      .attr("stroke-width", 0.55);

    // ── SVG defs: arrowhead marker ────────────────────────────────
    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", "v6-arrowhead")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", "9").attr("refY", "5")
      .attr("markerWidth", "5").attr("markerHeight", "5")
      .attr("orient", "auto")
      .append("polygon")
        .attr("points", "0 0, 10 5, 0 10")
        .attr("fill", "#FFD700");

    // ── Wind arrows (one per region) ─────────────────────────────
    const windG = mapG.append("g");
    const wsScale = d3.scaleLinear().domain([0, 12]).range([8, 44]).clamp(true);

    const arrows = windG.selectAll("line.v6arrow")
      .data(regionData)
      .join("line")
        .attr("class", "v6arrow")
        .attr("stroke", "#FFD700")
        .attr("stroke-width", 2)
        .attr("marker-end", "url(#v6-arrowhead)")
        .attr("opacity", 0.9);

    // ── Region markers + labels ───────────────────────────────────
    const regionG = mapG.append("g");

    regionG.selectAll("circle.v6mark")
      .data(regionData)
      .join("circle")
        .attr("class", "v6mark")
        .attr("cx", d => projection([d.region.lon, d.region.lat])[0])
        .attr("cy", d => projection([d.region.lon, d.region.lat])[1])
        .attr("r", 5)
        .attr("fill", "#FF6B35")
        .attr("stroke", "#FFD700")
        .attr("stroke-width", 1)
        .style("cursor", "pointer");

    regionG.selectAll("text.v6rname")
      .data(regionData)
      .join("text")
        .attr("class", "v6rname")
        .attr("x", d => projection([d.region.lon, d.region.lat])[0] + 8)
        .attr("y", d => projection([d.region.lon, d.region.lat])[1] + 4)
        .attr("font-size", "0.63rem")
        .attr("font-weight", "600")
        .attr("fill", "#bcd0e0")
        .attr("pointer-events", "none")
        .text(d => d.region.name);

    // ── Wind-speed legend ─────────────────────────────────────────
    const legG = mapG.append("g")
      .attr("transform", `translate(${W - 132}, ${mapH - 68})`);
    legG.append("rect")
      .attr("x", -6).attr("y", -16).attr("width", 126).attr("height", 66)
      .attr("fill", "rgba(5,12,24,0.80)").attr("rx", 4);
    legG.append("text")
      .attr("font-size", "0.59rem").attr("fill", "#7a9ab8").attr("y", 0)
      .text("Wind speed (arrows)");
    [4, 8, 12].forEach((ws, i) => {
      const len = wsScale(ws);
      const y   = 14 + i * 16;
      legG.append("line")
        .attr("x1", 0).attr("y1", y).attr("x2", len).attr("y2", y)
        .attr("stroke", "#FFD700")
        .attr("stroke-width", Math.max(1, ws / 4))
        .attr("marker-end", "url(#v6-arrowhead)");
      legG.append("text")
        .attr("x", len + 8).attr("y", y + 4)
        .attr("font-size", "0.58rem").attr("fill", "#8aacbc")
        .text(`${ws} m/s`);
    });

    // ── Tooltip ───────────────────────────────────────────────────
    const tooltip = d3.select("body").append("div")
      .style("position", "fixed")
      .style("background", "rgba(4,10,22,0.94)")
      .style("color", "#ddeeff")
      .style("padding", "0.4rem 0.7rem")
      .style("border-radius", "5px")
      .style("font-size", "0.8rem")
      .style("line-height", "1.55")
      .style("pointer-events", "none")
      .style("display", "none")
      .style("z-index", "9999")
      .style("border", "1px solid #2a5070");

    regionG.selectAll("circle.v6mark")
      .on("mousemove", function (event, d) {
        const f    = frames[frameIdx];
        const wind = d.windByMonth[f.key];
        const ws   = wind?.ws, wd = wind?.wd;
        const enso = f.oni == null    ? "N/A"
                   : f.oni >=  0.5   ? "El Niño"
                   : f.oni <= -0.5   ? "La Niña"
                   : "Neutral";
        const toward = (wd != null) ? `${Math.round((wd + 180) % 360)}°` : "N/A";
        tooltip
          .style("display", "block")
          .style("left", `${event.clientX + 14}px`)
          .style("top",  `${event.clientY - 38}px`)
          .html(
            `<strong>${d.region.name}</strong><br>` +
            `Wind speed: ${ws != null ? ws.toFixed(1) + " m/s" : "N/A"}<br>` +
            `Wind from: ${wd != null ? Math.round(wd) + "°" : "N/A"}  →  toward ${toward}<br>` +
            `ENSO: ${enso}` +
            (f.oni != null ? ` (ONI ${f.oni >= 0 ? "+" : ""}${f.oni.toFixed(2)})` : "")
          );
      })
      .on("mouseleave", () => tooltip.style("display", "none"));

    // ── Map attribution ───────────────────────────────────────────
    mapG.append("text")
      .attr("x", W - 6).attr("y", mapH - 5)
      .attr("text-anchor", "end")
      .attr("font-size", "0.55rem")
      .attr("fill", "#2a5070")
      .text("MODIS Terra via NASA GIBS  ·  Wind: NASA POWER");

    // ── ONI Timeline ──────────────────────────────────────────────
    const tlG = svg.append("g").attr("transform", `translate(0,${mapH})`);
    const tlPad = { l: 42, r: 10, t: 10, b: 24 };
    const tlInnerW = W - tlPad.l - tlPad.r;
    const tlInnerH = tlH - tlPad.t - tlPad.b;
    const barW     = Math.max(0.8, tlInnerW / frames.length - 0.25);

    const xScale = d3.scaleLinear()
      .domain([0, frames.length - 1])
      .range([tlPad.l, W - tlPad.r]);

    const yMid  = tlPad.t + tlInnerH / 2;
    const yScale = d3.scaleLinear()
      .domain([-2.5, 2.5])
      .range([tlPad.t + tlInnerH, tlPad.t]);

    tlG.append("rect")
      .attr("x", tlPad.l).attr("y", tlPad.t)
      .attr("width", tlInnerW).attr("height", tlInnerH)
      .attr("fill", "#07121e");

    // ONI bars — red = El Niño, blue = La Niña, dim = neutral
    tlG.selectAll("rect.oni-bar")
      .data(frames)
      .join("rect")
        .attr("class", "oni-bar")
        .attr("x",      (_, i) => xScale(i) - barW / 2)
        .attr("y",      d => {
          if (d.oni == null) return yMid;
          return d.oni >= 0 ? yScale(Math.min(d.oni, 2.5)) : yMid;
        })
        .attr("width",  barW)
        .attr("height", d => {
          if (d.oni == null) return 1;
          const c = Math.min(Math.abs(d.oni), 2.5);
          return Math.abs(yScale(0) - yScale(c));
        })
        .attr("fill", d =>
          d.oni == null       ? "#2a3a4a"
          : d.oni >=  0.5    ? "#d94030"
          : d.oni <= -0.5    ? "#3a6ab0"
          : "#3a4a58"
        );

    // Zero baseline
    tlG.append("line")
      .attr("x1", tlPad.l).attr("x2", W - tlPad.r)
      .attr("y1", yMid).attr("y2", yMid)
      .attr("stroke", "#2a5070").attr("stroke-width", 0.6);

    // Y-axis tick labels
    [["0", 0, "#667788"], ["+2.5", 2.5, "#d07060"], ["−2.5", -2.5, "#5080b8"]].forEach(
      ([label, val, color]) => {
        tlG.append("text")
          .attr("x", tlPad.l - 4).attr("y", yScale(val))
          .attr("dy", "0.35em").attr("text-anchor", "end")
          .attr("font-size", "0.59rem").attr("fill", color)
          .text(label);
      }
    );

    // "ONI" axis title
    tlG.append("text")
      .attr("x", tlPad.l - 4).attr("y", tlPad.t - 3)
      .attr("text-anchor", "end")
      .attr("font-size", "0.59rem").attr("fill", "#4a6a8a")
      .text("ONI");

    // Year tick labels on x-axis
    for (let y = START; y <= END; y += 2) {
      const i = frames.findIndex(f => f.year === y && f.month === 7);
      if (i < 0) continue;
      tlG.append("text")
        .attr("x", xScale(i))
        .attr("y", tlH - tlPad.b + 15)
        .attr("text-anchor", "middle")
        .attr("font-size", "0.58rem").attr("fill", "#4a6a8a")
        .text(y);
    }

    // Cursor line (moves with each frame)
    const cursor = tlG.append("line")
      .attr("y1", tlPad.t - 2)
      .attr("y2", tlPad.t + tlInnerH + 2)
      .attr("stroke", "#FFD700").attr("stroke-width", 1.5).attr("opacity", 0.85);

    // Cursor year label (shown at Jan/Jul frames)
    const cursorLabel = tlG.append("text")
      .attr("y", tlPad.t - 4)
      .attr("font-size", "0.6rem").attr("fill", "#FFD700")
      .attr("text-anchor", "middle").attr("opacity", 0);

    // Click-to-seek overlay
    tlG.append("rect")
      .attr("x", tlPad.l).attr("y", 0)
      .attr("width", tlInnerW).attr("height", tlH)
      .attr("fill", "transparent")
      .style("cursor", "pointer")
      .on("click", function (event) {
        const x = d3.pointer(event)[0];
        const i = Math.round(xScale.invert(x));
        frameIdx = Math.max(0, Math.min(frames.length - 1, i));
        update(frameIdx);
      });

    // ── update(idx) — drives all dynamic state ────────────────────
    function update(idx) {
      const f = frames[idx];

      // Satellite imagery
      gibsImg.attr("href", gibsUrl(activeLayer, f.dateStr, W, mapH));

      // Month / year label
      dateLabel.text(`${MONTH_NAMES[f.month - 1]} ${f.year}`);

      // ENSO phase badge
      const oni = f.oni;
      if (oni != null && oni >= 0.5) {
        badge.text("El Niño").style("background", "#2a1010").style("color", "#e08070");
      } else if (oni != null && oni <= -0.5) {
        badge.text("La Niña").style("background", "#0d1a30").style("color", "#7090d0");
      } else {
        badge.text("Neutral").style("background", "#141e2a").style("color", "#778899");
      }

      // Wind arrows — WD10M is "direction FROM", add 180° for spread direction
      arrows.each(function (d) {
        const wind = d.windByMonth[f.key];
        const [cx, cy] = projection([d.region.lon, d.region.lat]);
        const sel = d3.select(this);
        if (!wind || wind.ws == null || wind.wd == null) {
          sel.transition().duration(200)
            .attr("x1", cx).attr("y1", cy)
            .attr("x2", cx).attr("y2", cy);
          return;
        }
        const bearing = ((wind.wd + 180) % 360) * (Math.PI / 180);
        const len     = wsScale(wind.ws);
        const dx      = Math.sin(bearing) * len;
        const dy      = -Math.cos(bearing) * len;
        sel.transition().duration(200)
          .attr("x1", cx).attr("y1", cy)
          .attr("x2", cx + dx).attr("y2", cy + dy)
          .attr("stroke-width", Math.max(1.2, wind.ws / 3.5));
      });

      // ONI cursor
      const cx = xScale(idx);
      cursor.attr("x1", cx).attr("x2", cx);

      // Show year label at Jan/Jul frames
      if (f.month === 1 || f.month === 7) {
        cursorLabel.attr("x", cx).text(f.year).attr("opacity", 1);
      } else {
        cursorLabel.attr("opacity", 0);
      }
    }

    // ── Layer toggle ──────────────────────────────────────────────
    fireBtn.on("click", () => {
      activeLayer = LAYER_FIRE;
      styleLayerBtns();
      update(frameIdx);
    });
    smokeBtn.on("click", () => {
      activeLayer = LAYER_AEROSOL;
      styleLayerBtns();
      update(frameIdx);
    });

    // ── Play / Pause ──────────────────────────────────────────────
    playBtn.on("click", function () {
      playing = !playing;
      playBtn.text(playing ? "⏸ Pause" : "▶ Play");
      if (playing) {
        timer = setInterval(() => {
          frameIdx = (frameIdx + 1) % frames.length;
          update(frameIdx);
        }, 220);
      } else {
        clearInterval(timer);
      }
    });

    // ── Initial render (September 2015 — peak of strong El Niño) ──
    update(frameIdx);

  }).catch(err => {
    loadMsg.text("Error loading data — " + err.message);
    console.error("vis6 error:", err);
  });

})();
