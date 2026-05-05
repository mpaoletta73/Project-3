"""Create the static CMIP6 Pacific SST CSV used by the D3 checkpoint page.

This follows the assignment's CMIP6 notebook pattern:
1. Read the Google Cloud CMIP6 Zarr catalog with Pandas.
2. Select NCAR CESM2 historical monthly ocean sea surface temperature.
3. Open the Zarr store with anonymous GCS access and xarray.
4. Export a small static CSV that GitHub Pages can serve to D3.

Install dependencies in a virtual environment before running:
    python3 -m venv .venv
    . .venv/bin/activate
    pip install pandas xarray zarr gcsfs cftime nc-time-axis
    python scripts/prepare_cmip6_sst.py
"""

from pathlib import Path

import gcsfs
import pandas as pd
import xarray as xr

CATALOG_URL = "https://storage.googleapis.com/cmip6/cmip6-zarr-consolidated-stores.csv"
OUTPUT = Path("data/pacific_sst_subset.csv")

POINTS = [
    ("western_pacific", "Western Pacific", 145, 0),
    ("central_pacific", "Central Pacific", 190, 0),
    ("nino_34", "Nino 3.4", 210, 0),
    ("eastern_pacific", "Eastern Pacific", 250, 0),
]


def main():
    catalog = pd.read_csv(CATALOG_URL)
    matches = catalog.query(
        "activity_id == 'CMIP' & "
        "institution_id == 'NCAR' & "
        "source_id == 'CESM2' & "
        "experiment_id == 'historical' & "
        "table_id == 'Omon' & "
        "variable_id == 'tos' & "
        "member_id == 'r1i1p1f1' & "
        "grid_label == 'gr'"
    )
    if matches.empty:
        raise RuntimeError("No matching CMIP6 CESM2 historical Omon/tos store found.")

    zstore = matches.zstore.values[0]
    gcs = gcsfs.GCSFileSystem(token="anon")
    dataset = xr.open_zarr(gcs.get_mapper(zstore), consolidated=True)

    series = {}
    for key, _label, lon, lat in POINTS:
        timeseries = (
            dataset.tos
            .sel(time=slice("1981-01", "2014-12"))
            .sel(lat=lat, lon=lon, method="nearest")
            .load()
        )
        climatology = (
            timeseries
            .sel(time=slice("1981-01", "2010-12"))
            .groupby("time.month")
            .mean("time")
        )
        series[key] = (
            timeseries
            .groupby("time.month")
            - climatology
        ).sel(time=slice("1996-01", "2014-12"))

    nino = series["nino_34"]
    rows = ["date,year,month,region,region_label,longitude,latitude,sst_anomaly,enso_phase,source"]

    for index, time_value in enumerate(nino.time.values):
        year = int(time_value.year)
        month = int(time_value.month)
        date = f"{year}-{month:02d}"
        nino_value = float(nino.isel(time=index).values)
        if nino_value >= 0.5:
            phase = "El Niño"
        elif nino_value <= -0.5:
            phase = "La Niña"
        else:
            phase = "Neutral"

        for key, label, lon, lat in POINTS:
            value = float(series[key].isel(time=index).values)
            rows.append(",".join([
                date,
                str(year),
                str(month),
                key,
                label,
                str(lon),
                str(lat),
                f"{value:.3f}",
                phase,
                "CMIP6 CESM2 historical Omon/tos nearest equatorial grid point",
            ]))

    OUTPUT.write_text("\n".join(rows) + "\n")
    print(f"Wrote {OUTPUT} with {len(rows) - 1} rows")


if __name__ == "__main__":
    main()
