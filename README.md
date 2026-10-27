# SoCal El Niño Sea Level Outlook (2026–27)

By **Yang Chen** and **Claude** (an AI model made by Anthropic).

An interactive web page on how the very strong 2026–27 El Niño could raise sea level and winter high water along
the Southern California coast. It combines every tide-gauge record we could find for the region (San Diego since 1906,
La Jolla, Los Angeles, Santa Monica, Santa Barbara, four retired NOAA gauges and Ensenada, Mexico), gauges along the
whole Pacific coast of the Americas, satellite altimetry, and NOAA's October 2026 El Niño forecast. Readers can adjust
the forecast strength and uncertainty, pick a gauge and a measure, and switch between U.S. and metric units.

Companion page on rain: [SoCal El Niño Rain Outlook](https://ychenzgithub.github.io/ScalElNino/).

## View

Live page: <https://ychenzgithub.github.io/ScalSeaLevel/>

Or open `index.html` in a browser. Fonts and the d3 library load from public CDNs; everything else is local.
To serve it instead: `python3 -m http.server` in this folder, then visit <http://localhost:8000>.

## Files

| Path | What it is |
|---|---|
| `index.html` | Page structure and styles |
| `assets/app.js` | Charts, Monte Carlo projection and controls (d3 v7) |
| `assets/share.js` | Share buttons (X, Bluesky, Threads, Facebook, LinkedIn, Reddit, WhatsApp, email, copy link) |
| `assets/social-card.png` | Preview image shown when the link is shared |
| `data/sl_data.js` | Indices, forecast, gauges, monthly anomalies, seasonal measures, models, extremes, king tides, coast comparison |
| `data/sl_geo.js` | Gauge maps and satellite sea level maps |
| `data/*.csv` | The same results as tidy tables |
| `analysis/download_raw.py` | Downloads the raw data (NOAA CO-OPS, UHSLC, NOAA ERDDAP, NOAA CPC, Natural Earth) |
| `analysis/build_site_data.py` | Builds everything in `data/` from the raw downloads |
| `analysis/make_social_card.py` | Renders `assets/social-card.png` from the page header (needs playwright and Chrome) |

## Rebuild the data

```bash
python -I analysis/download_raw.py ~/Downloads/ScalSeaLevel          # about 1,700 requests; NOAA's API is rate-limited
unzip ~/Downloads/ScalSeaLevel/psmsl/rlr_monthly.zip -d ~/Downloads/ScalSeaLevel/psmsl/rlr
python -I analysis/build_site_data.py ~/Downloads/ScalSeaLevel ~/Downloads/ScalENSO data
```

`~/Downloads/ScalENSO` is the raw folder of the companion rain site (ERSSTv5 and the October 2026 CPC forecast pages),
used here for the same El Niño index and forecast. Run the Python commands with `rpy` (the shared research
environment) or any environment with numpy, pandas, scipy, xarray, netCDF4 and shapely.

After rebuilding, refresh the link-preview image so its numbers match the page:

```bash
python3 -m http.server 8000 &
python analysis/make_social_card.py http://127.0.0.1:8000/ assets/social-card.png
```

## Method in brief

For each gauge, monthly mean sea level minus the average seasonal cycle and a moving 19-year linear baseline gives the
sea level anomaly. For each gauge and measure (December–February average, November–March average, highest month, and
the highest hourly water of the winter adjusted to today's sea level), a linear regression relates winter values to
the November–January Relative Oceanic Niño Index, with separate El Niño and La Niña slopes and a separate spread for
El Niño winters. An optional second predictor adds this fall's (September–October) sea level. Projections combine the
El Niño forecast uncertainty, 150 bootstrap refits and the regression scatter. Skill and calibration are checked with
leave-one-out cross-validation. King tides for winter 2026–27 come from NOAA's tide predictions, raised by the sea level
rise since the 1983–2001 tidal epoch and by the projected El Niño anomaly. See the Methods and References sections of
the page.

This is an independent statistical analysis, not an official forecast.
