/**
 * main.js — Application entry point (Controller)
 *
 * Responsibilities:
 *  1. Load CSV data asynchronously via d3.csv()
 *  2. Parse & transform raw rows into typed objects
 *  3. Instantiate the Visualization
 *  4. Wire all UI controls to trigger filtered updates
 */

// ─── Constants ──────────────────────────────────────────────────────────────
const DATA_PATH = 'data/environmental_subset.csv';

// ─── Application State ──────────────────────────────────────────────────────
let state = {
  rawData:   [],
  variable:  'temperature',
  region:    'all',
  yearStart: 1990,
  yearEnd:   2020,
  chartType: 'line',
};

/** @type {Visualization|null} */
let vis = null;

// ─── Boot ────────────────────────────────────────────────────────────────────
(async function init() {
  showLoading(true);

  try {
    const raw = await d3.csv(DATA_PATH, parseRow);
    state.rawData = raw;
  } catch (err) {
    console.error('Failed to load data:', err);
    showError('Could not load data/environmental_subset.csv. Make sure you serve the project from a local HTTP server (e.g., python -m http.server 8000).');
    return;
  }

  showLoading(false);

  // Instantiate the D3 visualization
  vis = new Visualization('#vis-container', '#tooltip');
  vis.init();

  // First render with the default state
  vis.update(filterData());

  // Wire up UI controls
  bindControls();
})();

// ─── Data Parsing & Transformation ───────────────────────────────────────────

/**
 * Coerce a raw CSV row to the correct types.
 * d3.csv() passes every field as a string by default.
 *
 * @param {Object} d - raw CSV row
 * @returns {Object} typed row, or null to drop the row
 */
function parseRow(d) {
  const year = +d.year;
  const value = +d.value;

  // Drop rows with missing / non-numeric critical fields
  if (isNaN(year) || isNaN(value)) return null;

  return {
    year,
    value,
    variable: (d.variable || '').trim().toLowerCase(),
    region:   (d.region   || '').trim().toLowerCase().replace(/\s+/g, '_'),
    model:    (d.model    || 'N/A').trim(),
    unit:     (d.unit     || '').trim(),
  };
}

/**
 * Return a filtered + sorted subset of rawData based on current state.
 * Keep transformation logic here so vis.js stays purely presentational.
 *
 * @returns {Array<Object>}
 */
function filterData() {
  return state.rawData
    .filter(d => d.variable === state.variable)
    .filter(d => state.region === 'all' || d.region === state.region)
    .filter(d => d.year >= state.yearStart && d.year <= state.yearEnd)
    .sort((a, b) => a.year - b.year);
}

// ─── UI Binding ──────────────────────────────────────────────────────────────

function bindControls() {
  // Variable dropdown
  document.getElementById('variable-select').addEventListener('change', function () {
    state.variable = this.value;
    dispatchUpdate();
  });

  // Region dropdown
  document.getElementById('region-select').addEventListener('change', function () {
    state.region = this.value;
    dispatchUpdate();
  });

  // Year sliders (debounced to avoid excessive redraws)
  const yearStart = document.getElementById('year-start');
  const yearEnd   = document.getElementById('year-end');
  const yearLabel = document.getElementById('year-display');

  let debounceTimer;
  function onYearChange() {
    let s = +yearStart.value;
    let e = +yearEnd.value;
    // Enforce start <= end
    if (s > e) { s = e; yearStart.value = s; }
    state.yearStart = s;
    state.yearEnd   = e;
    yearLabel.textContent = `${s} \u2013 ${e}`;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(dispatchUpdate, 50);
  }

  yearStart.addEventListener('input', onYearChange);
  yearEnd.addEventListener('input', onYearChange);

  // Chart type buttons
  document.querySelectorAll('.chart-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      state.chartType = this.dataset.chart;
      if (vis) vis.setChartType(state.chartType);
      dispatchUpdate();
    });
  });

  // Reset
  document.getElementById('reset-btn').addEventListener('click', resetState);
}

/**
 * Filter the data and push it to the visualization.
 */
function dispatchUpdate() {
  if (!vis) return;
  vis.update(filterData());
}

/**
 * Restore all controls and state to their initial values.
 */
function resetState() {
  state.variable  = 'temperature';
  state.region    = 'all';
  state.yearStart = 1990;
  state.yearEnd   = 2020;
  state.chartType = 'line';

  document.getElementById('variable-select').value = 'temperature';
  document.getElementById('region-select').value   = 'all';
  document.getElementById('year-start').value      = 1990;
  document.getElementById('year-end').value        = 2020;
  document.getElementById('year-display').textContent = '1990 \u2013 2020';

  document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.chart-btn[data-chart="line"]').classList.add('active');

  if (vis) {
    vis.setChartType('line');
    vis.update(filterData());
  }
}

// ─── Loading / Error UI ──────────────────────────────────────────────────────

function showLoading(visible) {
  const container = document.getElementById('vis-container');
  let loader = container.querySelector('.loading');

  if (visible) {
    if (!loader) {
      loader = document.createElement('div');
      loader.className = 'loading';
      loader.innerHTML = '<div class="spinner"></div><span>Loading data…</span>';
      container.appendChild(loader);
    }
  } else {
    if (loader) loader.remove();
  }
}

function showError(message) {
  const container = document.getElementById('vis-container');
  showLoading(false);
  const err = document.createElement('div');
  err.className = 'loading';
  err.style.color = 'var(--color-danger)';
  err.textContent = message;
  container.appendChild(err);
}
