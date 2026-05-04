# El Nino and Pacific Sea Surface Temperature

DSC 106 Project 3 checkpoint page built with D3.js.

## Question

How do Pacific sea surface temperatures shift during El Nino events?

## Data

The checkpoint CSV at `data/pacific_sst_subset.csv` was prepared from the Google Cloud CMIP6 Zarr catalog:

- Model: NCAR CESM2
- Experiment: historical
- Table: `Omon` monthly ocean data
- Variable: `tos`, sea surface temperature
- Grid: `gr`
- Time exported for D3: 1996-2014
- Transformation: nearest equatorial Pacific grid-point SST anomaly relative to each point's 1981-2010 monthly climatology

The source files provided with the assignment confirm that `tos` means Sea Surface Temperature and that `Omon` is monthly ocean data.

## Checkpoint Visualizations

The page includes six D3 views for the checkpoint video:

1. Nino 3.4 SST anomaly time series
2. Monthly anomaly heatmap
3. ENSO phase comparison
4. Western, central, and eastern Pacific small multiples
5. Longitude profile during El Nino months
6. Interactive prototype with a time slider, phase filter, and Pacific point filter

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
