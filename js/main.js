const DATA_PATH = 'data/pacific_sst_subset.csv';

const state = {
  rows: [],
  allDates: [],
  filteredDates: [],
  dateIndex: 0,
  phase: 'all',
  regions: new Set(['western_pacific', 'central_pacific', 'nino_34', 'eastern_pacific']),
  playing: false,
  timer: null,
};

let vis;

d3.csv(DATA_PATH, parseRow)
  .then(rows => {
    state.rows = rows;
    state.allDates = Array.from(new Set(rows.map(d => d.date))).sort(d3.ascending);
    state.dateIndex = Math.max(0, state.allDates.indexOf('1997-12'));

    document.getElementById('data-status').textContent =
      `${rows.length.toLocaleString()} CMIP6 records loaded`;

    vis = new FinalSSTVisualization('#tooltip', onSelectDateFromChart);
    bindControls();
    applyPhaseFilter({ keepDate: state.allDates[state.dateIndex] });
    updateAll();
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
    regionLabel: d.region === 'nino_34' ? 'Niño 3.4' : d.region_label,
    longitude: +d.longitude,
    latitude: +d.latitude,
    anomaly: +d.sst_anomaly,
    phase: d.enso_phase,
    source: d.source,
    time: parseDate(d.date),
  };
}

function bindControls() {
  document.getElementById('play-button').addEventListener('click', togglePlayback);

  document.getElementById('phase-select').addEventListener('change', event => {
    const currentDate = state.filteredDates[state.dateIndex];
    state.phase = event.target.value;
    applyPhaseFilter({ keepDate: currentDate });
    updateAll();
  });

  document.getElementById('date-slider').addEventListener('input', event => {
    state.dateIndex = +event.target.value;
    updateAll();
  });

  document.querySelectorAll('input[name="region"]').forEach(input => {
    input.addEventListener('change', event => {
      if (event.target.checked) {
        state.regions.add(event.target.value);
      } else {
        state.regions.delete(event.target.value);
      }
      if (!state.regions.size) {
        state.regions.add(event.target.value);
        event.target.checked = true;
      }
      updateAll();
    });
  });
}

function applyPhaseFilter({ keepDate } = {}) {
  const ninoRows = state.rows.filter(d => d.region === 'nino_34');
  state.filteredDates = ninoRows
    .filter(d => state.phase === 'all' || d.phase === state.phase)
    .map(d => d.date);

  const preservedIndex = state.filteredDates.indexOf(keepDate);
  state.dateIndex = preservedIndex >= 0 ? preservedIndex : 0;

  const slider = document.getElementById('date-slider');
  slider.min = 0;
  slider.max = Math.max(0, state.filteredDates.length - 1);
  slider.value = state.dateIndex;
}

function updateAll() {
  const date = state.filteredDates[state.dateIndex];
  const selectedRows = state.rows.filter(d => d.date === date);
  const selectedPhase = selectedRows.find(d => d.region === 'nino_34')?.phase || '--';

  document.getElementById('date-slider').value = state.dateIndex;
  document.getElementById('date-label').textContent = formatMonth(date);
  document.getElementById('phase-count').textContent =
    `${state.filteredDates.length} ${state.filteredDates.length === 1 ? 'month' : 'months'}`;
  document.getElementById('selected-phase').textContent = selectedPhase;
  updateInsightCards(selectedRows, Array.from(state.regions));
  updatePatternCallout(selectedRows, Array.from(state.regions));

  vis.draw(state.rows, {
    date,
    phase: state.phase,
    filteredDates: state.filteredDates,
    regions: Array.from(state.regions),
  });
}

function updatePatternCallout(selectedRows, regions) {
  const visibleRows = selectedRows.filter(d => regions.includes(d.region));
  const west = visibleRows.find(d => d.region === 'western_pacific');
  const nino = selectedRows.find(d => d.region === 'nino_34');
  const east = visibleRows.find(d => d.region === 'eastern_pacific');
  if (!nino || visibleRows.length < 2) {
    document.getElementById('pattern-label').textContent = 'Single-region view';
    document.getElementById('pattern-note').textContent = 'Turn on more regions to compare the Pacific pattern.';
    return;
  }
  if (!west || !east) {
    const warmest = d3.greatest(visibleRows, d => d.anomaly);
    const coolest = d3.least(visibleRows, d => d.anomaly);
    document.getElementById('pattern-label').textContent = 'Filtered regional comparison';
    document.getElementById('pattern-note').textContent =
      `${formatMonth(nino.date)} is warmest at ${warmest.regionLabel} and coolest at ${coolest.regionLabel} among the regions turned on. Turn on the west and east endpoints to see the full gradient.`;
    return;
  }

  const values = visibleRows;
  const warmest = d3.greatest(values, d => d.anomaly);
  const coolest = d3.least(values, d => d.anomaly);
  const spread = warmest.anomaly - coolest.anomaly;
  const gradient = east.anomaly - west.anomaly;

  let label;
  let note;
  if (spread < 0.45) {
    label = 'Basin-wide shift';
    note = `${formatMonth(nino.date)} is pretty even across the sampled Pacific points. The warmest and coolest regions differ by only ${spread.toFixed(2)}°C.`;
  } else if (gradient > 0.6) {
    label = 'East-leaning warm pattern';
    note = `${formatMonth(nino.date)} is strongest toward the central/eastern Pacific, with the east ${formatSigned(gradient)}°C compared with the west.`;
  } else if (gradient < -0.6) {
    label = 'West-leaning warm pattern';
    note = `${formatMonth(nino.date)} is warmer in the west, with the east ${formatSigned(gradient)}°C compared with the west.`;
  } else if (warmest.region === 'nino_34' || warmest.region === 'central_pacific') {
    label = 'Central-Pacific peak';
    note = `${formatMonth(nino.date)} peaks near ${warmest.regionLabel}, close to the area used to define the phase.`;
  } else {
    label = 'Mixed regional pattern';
    note = `${formatMonth(nino.date)} does not follow a simple west-to-east pattern. Hover the dots to compare the sampled points.`;
  }

  document.getElementById('pattern-label').textContent = label;
  document.getElementById('pattern-note').textContent = note;
}


function updateInsightCards(selectedRows, regions) {
  const visibleRows = selectedRows.filter(d => regions.includes(d.region));
  const nino = selectedRows.find(d => d.region === 'nino_34');
  const west = visibleRows.find(d => d.region === 'western_pacific');
  const east = visibleRows.find(d => d.region === 'eastern_pacific');
  const warmest = d3.greatest(visibleRows, d => d.anomaly);
  const coolest = d3.least(visibleRows, d => d.anomaly);

  document.getElementById('selected-nino').textContent = nino ? `${formatSigned(nino.anomaly)}°C` : '--';
  document.getElementById('selected-nino-note').textContent = nino
    ? `${nino.phase} using the +/-0.5°C Niño 3.4 cutoff.`
    : 'Niño 3.4 is not available for this month.';

  if (west && east) {
    const gradient = east.anomaly - west.anomaly;
    document.getElementById('selected-gradient').textContent = `${formatSigned(gradient)}°C east minus west`;
    document.getElementById('selected-gradient-note').textContent = gradient >= 0
      ? 'The east is warmer than usual compared with the west.'
      : 'The west is warmer than usual compared with the east.';
  } else {
    document.getElementById('selected-gradient').textContent = 'Toggle east and west';
    document.getElementById('selected-gradient-note').textContent = 'Turn on both endpoint regions to compare the gradient.';
  }

  document.getElementById('selected-warmest').textContent = warmest
    ? `${warmest.regionLabel}: ${formatSigned(warmest.anomaly)}°C`
    : '--';
  document.getElementById('selected-coolest').textContent = coolest
    ? `Coolest: ${coolest.regionLabel} (${formatSigned(coolest.anomaly)}°C)`
    : '--';
}

function onSelectDateFromChart(date) {
  const index = state.filteredDates.indexOf(date);
  if (index < 0) return;
  state.dateIndex = index;
  updateAll();
}

function togglePlayback() {
  state.playing = !state.playing;
  const button = document.getElementById('play-button');
  button.textContent = state.playing ? 'Pause' : 'Play';

  if (!state.playing) {
    clearInterval(state.timer);
    state.timer = null;
    return;
  }

  state.timer = setInterval(() => {
    state.dateIndex = (state.dateIndex + 1) % state.filteredDates.length;
    updateAll();
  }, 850);
}

function parseDate(date) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function formatMonth(date) {
  return d3.utcFormat('%b %Y')(parseDate(date));
}

function formatSigned(value) {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}
