#!/usr/bin/env python
"""
Download the raw data for the Southern California El Nino sea level site.

Usage (from the project directory):
    python -I analysis/download_raw.py ~/Downloads/ScalSeaLevel

Re-running skips files that already exist, except the near-real-time ones (recent water levels,
ENSO indices, altimetry for the current month), which are always refreshed.

Sources
  NOAA CO-OPS (api.tidesandcurrents.noaa.gov): monthly means, hourly heights, hourly tide predictions,
      6-minute preliminary water levels, high/low predictions, datums, flood thresholds, high tide flooding counts
  UHSLC ERDDAP (uhslc.soest.hawaii.edu/erddap): daily sea level, research quality and fast delivery
  PSMSL (psmsl.org): monthly RLR archive (rlr_monthly.zip; unzip into psmsl/rlr)
  NOAA CoastWatch ERDDAP: AVISO monthly absolute dynamic topography (1992-2010), NOAA blended daily SLA (2015-)
  NOAA CPC: RONI, ONI, weekly OISST Nino indices
  Natural Earth: 10m and 50m land polygons
"""
import sys, json, time, datetime as dt
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.request import urlopen, Request
from urllib.parse import urlencode

RAW = Path(sys.argv[1]).expanduser()
TODAY = dt.date(2026, 10, 26)
API = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
MD = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations"
DP = "https://api.tidesandcurrents.noaa.gov/dpapi/prod/webapi/htf"
UH = "https://uhslc.soest.hawaii.edu/erddap/tabledap"
APP = "ScalSeaLevel"

# Southern California tide stations with usable records (from the CO-OPS historic station list),
# plus Port San Luis just north of Point Conception as a reference.
HOURLY = {  # id: first year with data
    "9410170": 1906, "9410230": 1924, "9410660": 1923, "9410840": 1933, "9411340": 1973,
    "9410580": 1955, "9410680": 1963, "9411270": 1962, "9411406": 1992, "9412110": 1945,
    "9410120": 1970, "9410650": 1973,
}
ACTIVE = ["9410170", "9410230", "9410660", "9410840", "9411340", "9412110", "9410678"]
ALL_SOCAL = ["9410025", "9410032", "9410079", "9410120", "9410135", "9410155", "9410170", "9410179", "9410196",
             "9410230", "9410302", "9410396", "9410580", "9410650", "9410660", "9410678", "9410680", "9410738",
             "9410840", "9410962", "9410971", "9411013", "9411270", "9411340", "9411399", "9411406", "9412110"]
# UHSLC stations along the Pacific coast of the Americas (non-US; US gauges come from CO-OPS / PSMSL)
UHSLC = [81, 88, 80, 83, 94, 93, 84, 678, 92, 91, 89, 98, 303, 85, 304, 300, 302, 87, 396, 679, 86, 82, 301, 675,
         394, 316, 395, 393, 673, 34, 671, 674, 305, 36, 308, 317, 543, 542, 541, 540,
         569, 554, 551, 556, 592, 558, 571, 559, 570, 560, 39, 41, 545, 565, 555, 573, 576, 557, 575, 572, 564, 583, 561, 574]


def get(url, path, force=False, tries=7):
    path = Path(path)
    if path.exists() and path.stat().st_size > 0 and not force:
        return "skip"
    path.parent.mkdir(parents=True, exist_ok=True)
    for k in range(tries):
        try:
            with urlopen(Request(url, headers={"User-Agent": "ScalSeaLevel research script"}), timeout=180) as r:
                data = r.read()
            path.write_bytes(data)
            if "tidesandcurrents" in url:
                time.sleep(1.0)          # be gentle: the CO-OPS API rate-limits bursts with HTTP 403
            return "ok"
        except Exception as e:  # noqa: BLE001
            if k == tries - 1 or any(c in str(e) for c in ("400", "404")):   # client errors will not succeed on retry
                print("  FAILED", url, e, flush=True)
                return "fail"
            time.sleep((60 if "403" in str(e) or "429" in str(e) else 3) * (k + 1))


def coops(params):
    q = dict(datum="STND", units="metric", time_zone="gmt", format="csv", application=APP)
    q.update(params)
    return API + "?" + urlencode(q)


jobs = []
# ---- CO-OPS metadata
for sid in ALL_SOCAL:
    jobs.append((f"{MD}/{sid}.json?expand=details,datums,floodlevels&units=metric", RAW / f"coops_meta/station_{sid}.json", False))
    jobs.append((f"{MD}/{sid}/datums.json?units=metric", RAW / f"coops_meta/datums_{sid}.json", False))
    jobs.append((f"{MD}/{sid}/floodlevels.json?units=metric", RAW / f"coops_meta/floodlevels_{sid}.json", False))
    jobs.append((coops(dict(product="monthly_mean", station=sid, begin_date="19000101", end_date="20261031")),
                 RAW / f"coops_monthly/mm_{sid}.csv", True))
# other US Pacific gauges, for the coast-wide comparison (monthly means only)
US_COAST = ["9413450", "9414290", "9416841", "9418767", "9419750", "9431647", "9432780", "9435380", "9440910", "9443090",
            "9450460", "9451600", "9453220", "9454050", "9455090", "9457292", "9459450", "9462620"]
for sid in US_COAST:
    jobs.append((coops(dict(product="monthly_mean", station=sid, begin_date="19000101", end_date="20261031")),
                 RAW / f"coops_monthly/mm_{sid}.csv", False))
for sid in ACTIVE + ["9410580", "9410680", "9411270", "9411406"]:
    jobs.append((f"{DP}/htf_annual.json?station={sid}", RAW / f"coops_meta/htf_annual_{sid}.json", False))
    jobs.append((f"{DP}/htf_met_year_annual_outlook.json?station={sid}", RAW / f"coops_meta/htf_outlook_{sid}.json", True))
    jobs.append((f"{DP}/htf_monthly.json?station={sid}", RAW / f"coops_meta/htf_monthly_{sid}.json", True))

# ---- hourly heights (1-year chunks) and hourly predictions (10-year chunks)
for sid, y0 in HOURLY.items():
    for y in range(y0, TODAY.year + 1):
        recent = y >= TODAY.year - 1
        if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0):   # requests are limited to 365 days: split leap years
            for (a, b, tag) in [("0101", "0630 23:59", "a"), ("0701", "1231 23:59", "b")]:
                jobs.append((coops(dict(product="hourly_height", station=sid, begin_date=f"{y}{a}", end_date=f"{y}{b}")),
                             RAW / f"coops_hourly/{sid}/{y}{tag}.csv", recent))
        else:
            jobs.append((coops(dict(product="hourly_height", station=sid, begin_date=f"{y}0101", end_date=f"{y}1231 23:59")),
                         RAW / f"coops_hourly/{sid}/{y}.csv", recent))
    for d in range(y0 - y0 % 10, TODAY.year + 1, 10):
        jobs.append((coops(dict(product="predictions", interval="h", station=sid, begin_date=f"{d}0101", end_date=f"{d + 9}1231 23:59")),
                     RAW / f"coops_pred/{sid}/{d}s.csv", False))

# ---- recent preliminary 6-minute water levels and predictions (31-day limit per request)
for sid in ACTIVE:
    for (a, b, tag) in [("20260801", "20260831 23:59", "202608"), ("20260901", "20260930 23:59", "202609"),
                        ("20261001", "20261026 23:59", "202610")]:
        jobs.append((coops(dict(product="water_level", station=sid, begin_date=a, end_date=b)),
                     RAW / f"coops_recent/{sid}_wl_{tag}.csv", True))
        jobs.append((coops(dict(product="predictions", interval="6", station=sid, begin_date=a, end_date=b)),
                     RAW / f"coops_recent/{sid}_pred6_{tag}.csv", False))
    jobs.append((coops(dict(product="predictions", interval="h", station=sid, begin_date="20261001", end_date="20261031 23:59")),
                 RAW / f"coops_recent/{sid}_predh_202610.csv", False))
    # winter 2026-27 high/low tide predictions (king tides), station datum and MLLW
    for datum in ["STND", "MLLW"]:
        jobs.append((coops(dict(product="predictions", interval="hilo", station=sid, begin_date="20261101", end_date="20270331 23:59",
                                datum=datum, time_zone="lst_ldt")),
                     RAW / f"coops_kingtides/{sid}_hilo_{datum}.csv", False))

# ---- UHSLC daily sea level
for u in UHSLC:
    jobs.append((f"{UH}/global_daily_rqds.csv?time,sea_level&uhslc_id={u}", RAW / f"uhslc/daily/{u}_rqds.csv", False))
    jobs.append((f"{UH}/global_daily_fast.csv?time,sea_level&uhslc_id={u}", RAW / f"uhslc/daily/{u}_fd.csv", True))
jobs.append((f"{UH}/global_daily_rqds.csv?uhslc_id,station_name,station_country,latitude,longitude&distinct()", RAW / "uhslc/rqds_stations.csv", False))

# ---- PSMSL monthly RLR archive (unzip it into psmsl/rlr before building)
jobs.append(("https://psmsl.org/data/obtaining/rlr.monthly.data/rlr_monthly.zip", RAW / "psmsl/rlr_monthly.zip", False))

# ---- ENSO indices (always refresh)
for name in ["RONI.ascii.txt", "oni.ascii.txt", "wksst9120.for"]:
    jobs.append((f"https://www.cpc.ncep.noaa.gov/data/indices/{name}", RAW / f"enso/{name}", True))

# ---- Natural Earth land
for res in ["10m", "50m"]:
    jobs.append((f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_{res}_land.geojson",
                 RAW / f"naturalearth/ne_{res}_land.geojson", False))

# ---- satellite altimetry, 1-degree subsample over the eastern and central Pacific
# AVISO monthly absolute dynamic topography (1992-10 to 2010-01)
AV = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/erdTAsshmday.nc"
for y in range(1993, 2010):
    for m in range(1, 13):  # all months: the 1993-2009 climatology also removes the seasonal cycle from the blended product
        t = f"{y}-{m:02d}-16T12:00:00Z"
        jobs.append((f"{AV}?ssh[({t})][(0.0)][(-30.125):4:(60.125)][(180.125):4:(290.125)]", RAW / f"altimetry/aviso_{y}{m:02d}.nc", False))
# NOAA CoastWatch blended near-real-time SLA, daily (2015-01-15 onward): every 3rd day of each month
BL = "https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDsshDaily.nc"
months = [(y, m) for y in range(2015, 2027) for m in [1, 9, 10]]
for (y, m) in months:
    if (y, m) == (2015, 1):
        a, b = "2015-01-16", "2015-01-31"
    elif (y, m) == (2026, 10):
        a, b = "2026-10-01", "2026-10-25"
    else:
        a = f"{y}-{m:02d}-01"
        b = f"{y}-{m:02d}-{30 if m == 9 else 31}"
    if dt.date.fromisoformat(a) > TODAY:
        continue
    jobs.append((f"{BL}?sla[({a}T12:00:00Z):3:({b}T12:00:00Z)][(-30.125):4:(60.125)][(-179.875):4:(-70.125)]",
                 RAW / f"altimetry/blended_{y}{m:02d}.nc", (y, m) == (2026, 10)))


def run(job):
    url, path, force = job
    return get(url, path, force=force)


if __name__ == "__main__":
    print(f"{len(jobs)} downloads into {RAW}")
    t0 = time.time()
    # CO-OPS limits request bursts, so its jobs run on 2 workers; other hosts in a separate pool
    noaa = [j for j in jobs if "tidesandcurrents" in j[0]]
    other = [j for j in jobs if "tidesandcurrents" not in j[0]]
    with ThreadPoolExecutor(max_workers=2) as ex1, ThreadPoolExecutor(max_workers=4) as ex2:
        f1 = ex1.map(run, noaa)
        f2 = ex2.map(run, other)
        res = list(f2) + list(f1)
    print({k: res.count(k) for k in set(res)}, f"{time.time() - t0:.0f} s")
