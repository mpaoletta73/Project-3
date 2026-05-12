# El Niño and Pacific Sea Surface Temperature

DSC 106 Project 3 final interactive visualization built with D3.js.

**Live site:** https://mpaoletta73.github.io/Project-3/

How do Pacific sea surface temperatures shift during El Niño events?

The final page answers this question by comparing western, central, Niño 3.4, and eastern Pacific SST anomalies.

## Data

The final visualization CSV at `data/pacific_sst_subset.csv` was prepared from the Google Cloud CMIP6 Zarr catalog:

- Model: NCAR CESM2
- Experiment: historical
- Table: `Omon` monthly ocean data
- Variable: `tos`, sea surface temperature
- Grid: `gr`
- Time exported for D3: 1996-2014
- Transformation: nearest equatorial Pacific grid-point SST anomaly relative to each point's 1981-2010 monthly climatology

The source files provided with the assignment confirm that `tos` means Sea Surface Temperature and that `Omon` is monthly ocean data.

## Final Visualization

The page includes one coordinated D3 explorer:

1. Niño 3.4 time series with ENSO phase bands, click selection, animation, and brush zoom
2. Selected-month longitude profile across four equatorial Pacific regions
3. Dynamic summary cards and basin-pattern callout for the selected month
4. Phase-contrast comparison by region
5. Seasonal heatmap for the currently enabled region set

The webpage also includes the required final write-up covering design rationale, data transformations, interaction choices, and development process.

## Run Locally

Serve the folder over HTTP:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Regenerate Data

Use a virtual environment because the CMIP6 Python packages are not part of the static website:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install pandas xarray zarr gcsfs cftime nc-time-axis
python scripts/prepare_cmip6_sst.py
```
