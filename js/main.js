const DATA_PATH = 'data/pacific_sst_subset.csv';

const state = {
  rows: [],
  dates: [],
  dateIndex: 0,
  phase: 'all',
  region: 'all',
/**
 * main.js — STUB / TEMPLATE FOR GROUP MEMBERS
 *
 * Each visualization lives in its own file (e.g. js/vis1.js, js/vis2.js).
 * Use this file as a reference for the recommended pattern, or delete it.
 *
 * ─── RECOMMENDED PATTERN ───────────────────────────────────────────────────
 *
 *  // 1. Load data
 *  d3.csv('data/your_file.csv', d => ({
 *    year:  +d.year,
 *    value: +d.value,
 *    // ...other fields
 *  })).then(data => {
 *
 *    // 2. Transform / filter here
 *    const filtered = data.filter(d => d.value != null);
 *
 *    // 3. Draw into the container your vis owns
 *    //    Vis 1 targets #vis-1
 *    //    Vis 2 targets #vis-2
 *    drawMyChart('#vis-1', filtered);
 *
 *  });
 *
 *  function drawMyChart(selector, data) {
 *    const container = d3.select(selector);
 *    // remove the placeholder text once you have data
 *    container.select('.placeholder').remove();
 *
 *    const svg = container.append('svg')
 *      .attr('width', '100%')
 *      .attr('height', 450);
 *
 *    // ... your D3 code here
 *  }
 *
 * ─── DATA SOURCES ──────────────────────────────────────────────────────────
 *  NOAA ONI index:  data/oni.csv   (columns: season, year, sst, anomaly)
 *  NASA/MODIS data: data/your_dataset.csv
 *
 * NOTE: run a local server to avoid CORS errors on d3.csv():
 *   python -m http.server 8000
 */

// ─── Application State ──────────────────────────────────────────────────────
let state = {
  rawData:   [],
  variable:  'temperature',
  region:    'all',
  yearStart: 1990,
  yearEnd:   2020,
  chartType: 'line',
};

let vis;

d3.csv(DATA_PATH, parseRow)
  .then(rows => {
    state.rows = rows;
    state.dates = Array.from(new Set(rows.map(d => d.date))).sort(d3.ascending);
    state.dateIndex = Math.max(0, state.dates.indexOf('1997-12'));

    document.getElementById('data-status').textContent =
      `${rows.length.toLocaleString()} CMIP6 records loaded`;

    vis = new CheckpointVisualizations('#tooltip');
    vis.drawAll(rows);

    bindControls();
    updatePrototype();
  })
  .catch(error => {
    console.error(error);
    document.getElementById('data-status').textContent =
      'Could not load data/pacific_sst_subset.csv';
  });

function parseRow(d) {
  return {
    date: d.date,
    year: +d.year,
    month: +d.month,
    region: d.region,
    regionLabel: d.region_label,
    longitude: +d.longitude,
    latitude: +d.latitude,
    anomaly: +d.sst_anomaly,
    phase: d.enso_phase,
    source: d.source,
  };
}

function bindControls() {
  const slider = document.getElementById('date-slider');
  slider.min = 0;
  slider.max = state.dates.length - 1;
  slider.value = state.dateIndex;

  slider.addEventListener('input', event => {
    state.dateIndex = +event.target.value;
    updatePrototype();
  });

  document.getElementById('phase-select').addEventListener('change', event => {
    state.phase = event.target.value;
    updatePrototype();
  });

  document.getElementById('region-select').addEventListener('change', event => {
    state.region = event.target.value;
    updatePrototype();
  });
}

function updatePrototype() {
  const date = state.dates[state.dateIndex];
  document.getElementById('date-label').textContent = formatMonth(date);
  vis.drawPrototype(state.rows, {
    date,
    phase: state.phase,
    region: state.region,
  });
}

function formatMonth(date) {
  const [year, month] = date.split('-').map(Number);
  return d3.utcFormat('%b %Y')(new Date(Date.UTC(year, month - 1, 1)));
}
