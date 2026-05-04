# Climate Data Visualization — Project 3

Interactive visualization of environmental data (CMIP6 / GOES / MODIS subset) built with D3.js.

**Live site:** https://YOUR-USERNAME.github.io/Project-3/

## What it does

- Line, scatter, and bar chart views of temperature, precipitation, CO₂, and sea-level data
- Filter by variable, region, and year range using the sidebar controls
- Hover any data point for exact values

## Run locally

GitHub Pages requires the files to be served over HTTP. To preview locally:

```bash
# Python 3
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Project structure

```
Project-3/
├── index.html          # Page shell + write-up
├── css/style.css       # Styles
├── js/
│   ├── main.js         # Data loading, state, event listeners
│   └── visualization.js# D3 drawing logic
└── data/
    └── environmental_subset.csv
```
