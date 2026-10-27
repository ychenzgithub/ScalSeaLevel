#!/usr/bin/env python
"""
Build the derived data files used by the Southern California El Nino sea level website (index.html).

Usage (from the project directory):
    python -I analysis/build_site_data.py ~/Downloads/ScalSeaLevel ~/Downloads/ScalENSO data

Inputs
  RAW, written by analysis/download_raw.py (plus psmsl/rlr_monthly.zip unzipped into psmsl/rlr):
    coops_monthly/mm_<id>.csv            NOAA CO-OPS monthly means (station datum, metres)
    coops_hourly/<id>/<year>.csv          NOAA CO-OPS verified hourly heights
    coops_pred/<id>/<decade>s.csv         NOAA CO-OPS hourly tide predictions
    coops_recent/*                        6-minute preliminary water levels and predictions, Aug-Oct 2026
    coops_kingtides/*                     high/low tide predictions, Nov 2026 - Mar 2027
    coops_meta/*                          station metadata, datums, flood thresholds, high tide flooding counts
    uhslc/daily/<id>_{rqds,fd}.csv        UHSLC daily sea level (research quality and fast delivery)
    psmsl/rlr/rlr_monthly/                PSMSL monthly RLR archive
    altimetry/*.nc                        AVISO monthly ADT (1993-2009) and NOAA blended daily SLA (2015-2026)
    enso/RONI.ascii.txt, oni.ascii.txt, wksst9120.for     NOAA CPC
    naturalearth/ne_{10m,50m}_land.geojson
  ENSO_RAW, the raw folder of the companion rain site (ScalElNino):
    ersst/sst.mnmean.nc, enso_indices/ersst.v5.pdo.dat, forecasts/cpc_*roni_*.html (October 2026 outlook)

Outputs (OUT)
  sl_data.js   window.SL_DATA (indices, forecast, gauges, anomalies, models, extremes, king tides, coast comparison)
  sl_geo.js    window.SL_GEO (gauge map, Pacific coast map, satellite sea level maps)
  *.csv        tidy tables offered for download
"""
import sys, re, glob, json, html
from pathlib import Path
import numpy as np
import pandas as pd
import xarray as xr
from scipy import optimize, stats

RAW = Path(sys.argv[1]).expanduser()
ENSO_RAW = Path(sys.argv[2]).expanduser()
OUT = Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(20261026)
NBOOT = 150
LAST_YEAR = 2026            # last complete winter season-year (Dec 2025 - Feb 2026)
FC_YEAR = 2027              # winter being projected (Dec 2026 - Feb 2027)
T_FC = 2027.04              # mid-January 2027, where baselines are evaluated for the projection
BUILT = "2026-10-26"
WIN = 19.0                  # baseline window (years): the length of a National Tidal Datum Epoch

SMAP = dict(DJF=1, JFM=2, FMA=3, MAM=4, AMJ=5, MJJ=6, JJA=7, JAS=8, ASO=9, SON=10, OND=11, NDJ=12)
MON3 = {v: k for k, v in SMAP.items()}
CATS = [
    ("lnS", "Moderate–strong La Niña", -99, -1.0),
    ("lnW", "Weak La Niña", -1.0, -0.5),
    ("neu", "Neutral", -0.5, 0.5),
    ("enWM", "Weak–moderate El Niño", 0.5, 1.5),
    ("enS", "Strong El Niño", 1.5, 2.0),
    ("enVS", "Very strong El Niño", 2.0, 99),
]


def category(x):
    if x is None or not np.isfinite(x):
        return None
    return "lnS" if x <= -1 else "lnW" if x <= -0.5 else "neu" if x < 0.5 else "enWM" if x < 1.5 else "enS" if x < 2 else "enVS"


def r(v, nd=1):
    if v is None:
        return None
    try:
        if not np.isfinite(v):
            return None
    except TypeError:
        return v
    return round(float(v), nd)


def rl(a, nd=1):
    return [r(v, nd) for v in a]


def tdec(ts):
    """Decimal year at the middle of the month (or at the exact time)."""
    ts = pd.DatetimeIndex(ts)
    return ts.year.values + (ts.dayofyear.values - 0.5 + ts.hour.values / 24) / (365.25)


def mdec(idx):
    idx = pd.DatetimeIndex(idx)
    return idx.year.values + (idx.month.values - 0.5) / 12


def first_existing(*paths):
    for p in paths:
        if Path(p).exists():
            return Path(p)
    raise FileNotFoundError(paths)


# --------------------------------------------------------------------------------------------
# 1. ENSO: official RONI (1950-) extended back with an ERSSTv5 reconstruction (as in the rain site)
# --------------------------------------------------------------------------------------------
print("ENSO indices ...")
ds = xr.open_dataset(ENSO_RAW / "ersst/sst.mnmean.nc")
sst = ds.sst
coslat = np.cos(np.deg2rad(sst.lat))


def box(lat0, lat1, lon0, lon1):
    s = sst.sel(lat=slice(lat1, lat0), lon=slice(lon0, lon1))
    return s.weighted(coslat.sel(lat=s.lat)).mean(("lat", "lon")).to_series()


def anom(s, y0=1991, y1=2020):
    b = s[(s.index.year >= y0) & (s.index.year <= y1)]
    return s - b.groupby(b.index.month).mean().reindex(s.index.month).values


n34a = anom(box(-5, 5, 190, 240))
tropa = anom(box(-20, 20, 0, 360))
rel = n34a - tropa
base_ = (rel.index.year >= 1991) & (rel.index.year <= 2020)
rel_monthly = rel * (n34a[base_].std() / rel[base_].std())
roni_v5 = rel_monthly.rolling(3, center=True).mean()
off = pd.read_csv(first_existing(RAW / "enso/RONI.ascii.txt", ENSO_RAW / "enso_indices/RONI.ascii.txt"), sep=r"\s+")
off["date"] = pd.to_datetime(dict(year=off.YR, month=off.SEAS.map(SMAP), day=1))
roni_off = off.set_index("date").ANOM.sort_index()
ov = pd.concat([roni_off.rename("o"), roni_v5.rename("m")], axis=1, sort=True).dropna().loc[:"2024-12"]
cal = np.polyfit(ov.m, ov.o, 1)
recon_stats = dict(r=float(np.corrcoef(ov.m, ov.o)[0, 1]), rmse=float(np.sqrt(((np.polyval(cal, ov.m) - ov.o) ** 2).mean())))
roni = pd.Series(np.polyval(cal, roni_v5), index=roni_v5.index)
roni = roni.reindex(roni.index.union(roni_off.index))
roni.loc[roni_off.index] = roni_off.values
roni = roni.dropna()
oni = pd.read_csv(first_existing(RAW / "enso/oni.ascii.txt", ENSO_RAW / "enso_indices/oni.ascii.txt"), sep=r"\s+")
oni["date"] = pd.to_datetime(dict(year=oni.YR, month=oni.SEAS.map(SMAP), day=1))
oni_s = oni.set_index("date").ANOM.sort_index()


def ndj_by_season_year(s):
    d = s[s.index.month == 12]
    return pd.Series(d.values, index=d.index.year + 1)


ndj = ndj_by_season_year(roni)
oni_ndj = ndj_by_season_year(oni_s)
YEARS = np.arange(1906, LAST_YEAR + 1)
X = ndj.reindex(YEARS)
X_OFF = pd.Series([Y >= 1951 for Y in YEARS], index=YEARS)

wk = []
for line in open(first_existing(RAW / "enso/wksst9120.for", ENSO_RAW / "enso_indices/wksst9120.for")):
    m = re.match(r"\s*(\d{2}[A-Z]{3}\d{4})\s+([-\d.\s]+)$", line)
    if m:
        v = [float(t) for t in re.findall(r"-?\d+\.\d", m.group(2))]
        if len(v) == 8:
            wk.append((pd.to_datetime(m.group(1), format="%d%b%Y"), *v))
wk = pd.DataFrame(wk, columns=["date", "n12", "n12a", "n3", "n3a", "n34", "n34a", "n4", "n4a"]).set_index("date")
current = dict(weekly_date=wk.index[-1].strftime("%Y-%m-%d"), weekly_n34=float(wk.n34a.iloc[-1]),
               roni_latest=float(roni_off.iloc[-1]), roni_latest_season=f"{MON3[roni_off.index[-1].month]} {roni_off.index[-1].year}")
print("  current:", current, " recon r=%.3f" % recon_stats["r"])

# CPC official RONI outlook, October 2026 (same tables as the rain site)
print("CPC forecast tables ...")


def html_rows(path):
    t = open(path, encoding="utf-8", errors="replace").read()
    rows = []
    for row in re.findall(r"(?is)<tr.*?</tr>", t):
        cells = [html.unescape(re.sub(r"(?s)<.*?>", "", c)).strip() for c in re.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", row)]
        if cells and re.match(r"^(DJF|JFM|FMA|MAM|AMJ|MJJ|JJA|JAS|ASO|SON|OND|NDJ)\b", cells[0]):
            rows.append([cells[0][:3]] + [float(c) for c in cells[1:]])
    return rows


fdir = ENSO_RAW / "forecasts"
outlook = html_rows(glob.glob(str(fdir / "*roni_outlook*.html"))[0])
fc_dates = pd.date_range("2026-10-01", periods=len(outlook), freq="MS")
fc_table = [dict(season=row[0], center=d.strftime("%Y-%m"), label=f"{row[0]} {d.year if row[0] != 'NDJ' else '2026–27'}",
                 q05=row[1], q15=row[2], q25=row[3], q50=row[4], q75=row[5], q85=row[6], q95=row[7]) for d, row in zip(fc_dates, outlook)]
ndj_fc = [f for f in fc_table if f["season"] == "NDJ"][0]
sig = np.mean([(ndj_fc["q95"] - ndj_fc["q05"]) / (2 * 1.6449), (ndj_fc["q85"] - ndj_fc["q15"]) / (2 * 1.0364),
               (ndj_fc["q75"] - ndj_fc["q25"]) / (2 * 0.6745)])
forecast = dict(issued="2026-10-08", ndj_median=ndj_fc["q50"], ndj_sigma=round(float(sig), 2), ndj_q05=ndj_fc["q05"],
                ndj_q95=ndj_fc["q95"], table=fc_table, nmme_rel_peak=3.5, historic=dict(SON=54, OND=83, NDJ=70))
print("  NDJ forecast median/sigma:", ndj_fc["q50"], round(sig, 3))

# --------------------------------------------------------------------------------------------
# 2. Readers
# --------------------------------------------------------------------------------------------


def read_coops_monthly(sid):
    f = RAW / f"coops_monthly/mm_{sid}.csv"
    d = pd.read_csv(f, skipinitialspace=True)
    d.columns = [c.strip() for c in d.columns]
    for c in ["MSL", "Highest"]:
        d[c] = pd.to_numeric(d[c], errors="coerce")
    d = d.dropna(subset=["MSL"])
    idx = pd.to_datetime(dict(year=d.Year, month=d.Month, day=1))
    return (pd.Series(d.MSL.values * 100, index=idx).sort_index(),
            pd.Series(d.Highest.values * 100, index=idx).sort_index())


PS = RAW / "psmsl/rlr/rlr_monthly"
psmsl_meta = {}
for line in open(PS / "filelist.txt"):
    p = [q.strip() for q in line.split(";")]
    psmsl_meta[int(p[0])] = dict(lat=float(p[1]), lon=float(p[2]), name=p[3].title())


def read_psmsl(pid):
    rows = {}
    for line in open(PS / f"data/{pid}.rlrdata"):
        p = line.split(";")
        t, v = float(p[0]), int(p[1])
        if v <= -99999:
            continue
        y = int(t)
        rows[pd.Timestamp(y, int(round((t - y) * 12 + 0.5)), 1)] = v / 10.0
    return pd.Series(rows).sort_index()


def read_uhslc_monthly(u):
    parts = {}
    for kind in ["rqds", "fd"]:
        f = RAW / f"uhslc/daily/{u}_{kind}.csv"
        if not f.exists() or f.stat().st_size < 60:
            continue
        d = pd.read_csv(f, skiprows=[1])
        if "sea_level" not in d.columns or d.empty:
            continue
        d["sea_level"] = pd.to_numeric(d.sea_level, errors="coerce")
        d = d[(d.sea_level > -9000) & d.sea_level.notna()]
        s = pd.Series(d.sea_level.values / 10.0, index=pd.to_datetime(d.time.str[:10]))
        g = s.groupby([s.index.year, s.index.month])
        mm = g.mean()[g.count() >= 20]
        mm.index = pd.to_datetime([f"{a}-{b:02d}-01" for a, b in mm.index])
        parts[kind] = mm
    if not parts:
        return None
    if "rqds" in parts and "fd" in parts:
        o = (parts["rqds"] - parts["fd"]).dropna()
        offset = float(o.median()) if len(o) >= 12 else 0.0
        return parts["rqds"].combine_first(parts["fd"] + offset)
    return parts.get("rqds", parts.get("fd"))


def read_csv_series(f, col=1, scale=100.0):
    f = Path(f)
    if not f.exists():
        return None
    with open(f) as fh:
        head = fh.readline()
    if not head.startswith("Date Time"):
        return None
    x = pd.read_csv(f, skipinitialspace=True, usecols=[0, col])
    x.columns = ["t", "v"]
    x["v"] = pd.to_numeric(x.v, errors="coerce")
    x = x.dropna()
    return pd.Series(x.v.values * scale, index=pd.to_datetime(x.t))


def read_hourly(sid, folder):
    parts = [read_csv_series(f) for f in sorted((RAW / folder / sid).glob("*.csv"))]
    parts = [p for p in parts if p is not None and len(p)]
    if not parts:
        return None
    s = pd.concat(parts).sort_index()
    return s[~s.index.duplicated()]


def jload(f):
    try:
        return json.load(open(f))
    except Exception:  # noqa: BLE001
        return None


# --------------------------------------------------------------------------------------------
# 3. Monthly anomalies: remove the seasonal cycle and a moving 19-year baseline
# --------------------------------------------------------------------------------------------
X_LAG1 = roni.copy()
X_LAG1.index = X_LAG1.index + pd.offsets.MonthBegin(1)      # index value at month t is RONI centred on t-1


class Baseline:
    """Local linear fit in a 19-year window, shifted (not shortened) at the ends of the record, so that near the
    end of the record the baseline is the linear trend of the last 19 years."""

    def __init__(self, t, z):
        ok = np.isfinite(z)
        self.t, self.z = t[ok], z[ok]
        self.t0, self.t1 = self.t.min(), self.t.max()

    def window(self, tq):
        if self.t1 - self.t0 <= WIN:
            return self.t0, self.t1
        a = min(max(tq - WIN / 2, self.t0), self.t1 - WIN)
        return a, a + WIN

    def mask(self, a, b):
        m = (self.t >= a) & (self.t <= b)
        while m.sum() < 60:            # gappy record: widen the window until it holds 5 years of months
            a, b = a - 2, b + 2
            m = (self.t >= a) & (self.t <= b)
        return m

    def __call__(self, tq):
        tq = np.atleast_1d(np.asarray(tq, float))
        out = np.empty_like(tq)
        cache = {}
        for i, q in enumerate(tq):
            a, b = self.window(q)
            key = (round(a, 3), round(b, 3))
            if key not in cache:
                m = self.mask(a, b)
                cache[key] = np.polyfit(self.t[m] - 2000, self.z[m], 1)
            out[i] = np.polyval(cache[key], q - 2000)
        return out

    def slope(self, tq):
        a, b = self.window(tq)
        m = self.mask(a, b)
        return float(np.polyfit(self.t[m], self.z[m], 1)[0])


def decompose(s, iters=3):
    idx = pd.date_range(s.index.min(), s.index.max(), freq="MS")
    y = s.reindex(idx).values.astype(float)
    t = mdec(idx)
    mon = idx.month.values - 1
    ok = np.isfinite(y)
    xl = X_LAG1.reindex(idx).values
    enso = np.zeros_like(y)
    seas = np.zeros(12)
    for _ in range(iters):
        B = Baseline(t, y - seas[mon] - enso)
        # evaluate on a yearly grid and interpolate (fast and smooth)
        grid = np.arange(np.floor(t.min()), np.ceil(t.max()) + 1.01, 0.5)
        base = np.interp(t, grid, B(grid))
        rres = y - base - enso
        seas = np.array([np.nanmean(rres[ok & (mon == m)]) for m in range(12)])
        seas -= seas.mean()
        a = y - seas[mon] - base
        g = ok & np.isfinite(xl)
        if g.sum() > 120:
            A = np.c_[np.ones(g.sum()), np.minimum(xl[g], 0), np.maximum(xl[g], 0)]
            c = np.linalg.lstsq(A, a[g], rcond=None)[0]
            enso = np.where(np.isfinite(xl), c[1] * np.minimum(xl, 0) + c[2] * np.maximum(xl, 0), 0.0)
    return dict(idx=idx, y=y, seas=seas, base=base, B=B, anom=pd.Series(y - seas[mon] - base, index=idx),
                trend_full=float(np.polyfit(t[ok], y[ok], 1)[0]) * 10)   # mm/yr


GAUGES = [
    dict(id="sd", coops="9410170", name="San Diego", sub="San Diego Bay", kind="active"),
    dict(id="lj", coops="9410230", name="La Jolla", sub="Scripps Pier, open coast", kind="active"),
    dict(id="la", coops="9410660", name="Los Angeles", sub="Outer harbor, San Pedro", kind="active"),
    dict(id="sm", coops="9410840", name="Santa Monica", sub="Municipal Pier", kind="active"),
    dict(id="sb", coops="9411340", name="Santa Barbara", sub="Santa Barbara harbor", kind="active"),
    dict(id="nb", coops="9410580", name="Newport Beach", sub="Newport Bay entrance (retired)", kind="retired"),
    dict(id="lb", coops="9410680", name="Long Beach", sub="Terminal Island (retired)", kind="retired"),
    dict(id="ri", coops="9411270", name="Rincon Island", sub="Offshore island near Carpinteria (retired)", kind="retired"),
    dict(id="ph", coops="9411406", name="Platform Harvest", sub="Oil platform off Point Conception (retired)", kind="retired"),
    dict(id="en", psmsl=795, name="Ensenada", sub="Baja California, Mexico (PSMSL record)", kind="mexico"),
]
REGION_MEMBERS = ["sd", "lj", "la", "sm", "sb"]

print("Monthly sea level ...")
dec = {}
highest = {}
meta_out = {}
for g in GAUGES:
    if "coops" in g:
        s, hi = read_coops_monthly(g["coops"])
        highest[g["id"]] = hi
        g["lat"], g["lon"] = None, None
    else:
        s = read_psmsl(g["psmsl"])
    dec[g["id"]] = d = decompose(s)
    a = d["anom"].dropna()
    g["first"], g["last"], g["nmonths"] = a.index.min().strftime("%Y-%m"), a.index.max().strftime("%Y-%m"), int(len(a))
    g["trend_full"] = r(d["trend_full"], 2)
    g["trend_recent"] = r(10 * d["B"].slope(d["B"].t1), 2)
    print(f"  {g['id']}: {g['first']}..{g['last']} n={g['nmonths']} trend {g['trend_full']} mm/yr (last 19 yr {g['trend_recent']}), "
          f"resid sd {a.std():.1f} cm")

# regional average of the long-running gauges (two or more reporting)
A = pd.concat({k: dec[k]["anom"] for k in REGION_MEMBERS}, axis=1)
reg = A.mean(axis=1).where(A.notna().sum(axis=1) >= 2).dropna()
reg = reg.loc["1923-12":]
REGION = dict(id="reg", name="Southern California average", sub="Average of San Diego, La Jolla, Los Angeles, Santa Monica and Santa Barbara",
              kind="region", first=reg.index.min().strftime("%Y-%m"), last=reg.index.max().strftime("%Y-%m"), nmonths=int(len(reg)))
ANOM = {g["id"]: dec[g["id"]]["anom"] for g in GAUGES}
ANOM["reg"] = reg

# ---- October 2026 to date from preliminary 6-minute data: monthly mean ~ full-month mean tide + partial-month mean residual
print("October 2026 (preliminary) ...")
so_far = {}
for g in GAUGES:
    if g["kind"] != "active":
        continue
    sid = g["coops"]
    est = {}
    for tag, mstart in [("202609", "2026-09-01"), ("202610", "2026-10-01")]:
        wl = read_csv_series(RAW / f"coops_recent/{sid}_wl_{tag}.csv")
        p6 = read_csv_series(RAW / f"coops_recent/{sid}_pred6_{tag}.csv")
        if wl is None or p6 is None:
            continue
        res = (wl - p6.reindex(wl.index)).dropna()
        if tag == "202610":
            ph = read_csv_series(RAW / f"coops_recent/{sid}_predh_202610.csv")
            full_tide = ph.mean() if ph is not None else p6.mean()
            cut = res.index.max()
        else:  # check the estimator on September, using only Sep 1-26 residuals
            full_tide = p6.mean()
            res = res[: "2026-09-26 23:59"]
            cut = res.index.max()
        est[tag] = (full_tide + res.mean(), cut, len(res) / 240.0)
    d = dec[g["id"]]
    if "202610" in est:
        v, cut, ndays = est["202610"]
        t = 2026 + 9.5 / 12
        a_oct = v - d["seas"][9] - d["B"](t)[0]
        so_far[g["id"]] = dict(oct_anom=r(a_oct), through=cut.strftime("%Y-%m-%d"), days=r(ndays, 1))
    if "202609" in est:
        v9 = est["202609"][0]
        true9 = d["y"][-1] if d["idx"][-1] == pd.Timestamp("2026-09-01") else np.nan
        print(f"  {g['id']}: Sep check estimate {v9:.1f} vs monthly mean {true9:.1f} cm;  Oct anomaly {so_far.get(g['id'], {}).get('oct_anom')} cm")
if so_far:
    so_far["reg"] = dict(oct_anom=r(np.mean([so_far[k]["oct_anom"] for k in REGION_MEMBERS if k in so_far])),
                         through=min(so_far[k]["through"] for k in REGION_MEMBERS if k in so_far))

# --------------------------------------------------------------------------------------------
# 4. Datums, flood thresholds, hourly extremes
# --------------------------------------------------------------------------------------------
print("Datums and hourly extremes ...")


def datums(sid):
    d = jload(RAW / f"coops_meta/datums_{sid}.json")
    if not d or "datums" not in d:
        return None
    v = {x["name"]: x["value"] for x in d["datums"] if x.get("value") is not None}
    return dict(epoch=d.get("epoch"), **{k: v[k] * 100 for k in ["MHHW", "MHW", "MSL", "MLLW", "GT"] if k in v})


def flood(sid, dm):
    f = jload(RAW / f"coops_meta/floodlevels_{sid}.json") or {}
    gt = dm["GT"] / 100
    out = {}
    for k, (a, b) in dict(minor=(0.04, 0.50), moderate=(0.03, 0.80), major=(0.04, 1.17)).items():
        v = f.get(f"nos_{k}")
        out[k] = (v * 100 - dm["MHHW"]) if v is not None else 100 * (a * gt + b)   # above MHHW, cm
    out["source"] = "NOAA" if f.get("nos_minor") is not None else "derived (Sweet et al. 2018)"
    if f.get("nws_minor") is not None:
        out["nws_minor"] = f["nws_minor"] * 100 - dm["MHHW"]
    return out


extremes = {}
top_events = {}
kingtides = {}
hourly_cov = {}
for g in GAUGES:
    if "coops" not in g:
        g["datums"] = None
        continue
    sid = g["coops"]
    dm = datums(sid)
    g["datums"] = {k: (r(v, 1) if isinstance(v, float) else v) for k, v in dm.items()} if dm else None
    g["flood"] = {k: (r(v, 1) if isinstance(v, float) else v) for k, v in flood(sid, dm).items()} if dm else None
    meta = jload(RAW / f"coops_meta/station_{sid}.json")
    if meta and meta.get("stations"):
        st = meta["stations"][0]
        g["lat"], g["lon"] = round(st["lat"], 4), round(st["lng"], 4)
    obs = read_hourly(sid, "coops_hourly")
    pred = read_hourly(sid, "coops_pred")
    if obs is None or dm is None:
        continue
    d = dec[g["id"]]
    B = d["B"]
    b_fc = float(B(T_FC)[0])
    near = {"nb": "la", "lb": "la", "ri": "sb", "ph": "sb"}.get(g["id"])
    if near:
        # retired gauge: its own baseline at the end of the record, plus the rise at the nearest running gauge since then
        Bn, te = dec[near]["B"], B.t1
        b_fc = float(B(te)[0] + Bn(T_FC)[0] - Bn(te)[0])
    mhhw = dm["MHHW"]
    minor = g["flood"]["minor"] + mhhw
    g["rise_since"] = {str(y): r(b_fc - float(B(y + 0.04)[0])) for y in [1983, 1998, 2016] if y >= B.t0 - 1}
    if pred is not None and g["kind"] == "active":
        # highest predicted tide of each November-March, above MHHW (shows the 18.6-year lunar cycle)
        tm = []
        for Y in range(1980, 2030):
            pw = pred[pd.Timestamp(Y - 1, 11, 1): pd.Timestamp(Y, 3, 31, 23)]
            if len(pw) > 3000:
                tm.append([Y, r(pw.max() - mhhw)])
        g["tide_max"] = tm
    pred = pred.reindex(obs.index) if pred is not None else pd.Series(np.nan, index=obs.index)
    resid = obs - pred
    rmon = resid.groupby([resid.index.year, resid.index.month]).mean()
    hourly_cov[g["id"]] = (obs.index.min().year, obs.index.max().strftime("%Y-%m-%d"), int(obs.notna().sum()))
    rows = {k: [] for k in ["hmax", "hmax_obs", "t", "tide", "bg", "surge", "days_minor", "days_minor_obs"]}
    for Y in YEARS:
        a, b = pd.Timestamp(Y - 1, 11, 1), pd.Timestamp(Y, 4, 1)
        h = obs[a: b - pd.Timedelta(hours=1)]
        if len(h) < 0.8 * (b - a) / pd.Timedelta(hours=1):
            for k in rows:
                rows[k].append(None)
            continue
        i = h.idxmax()
        v = float(h.max())
        adj = b_fc - float(B(tdec([i])[0])[0])
        rm = rmon.get((i.year, i.month), np.nan)
        pv = pred.get(i, np.nan)
        dmax = h.resample("D").max()
        adj_season = b_fc - float(B(Y + 0.04)[0])
        rows["hmax"].append(r(v - mhhw + adj))
        rows["hmax_obs"].append(r(v - mhhw))
        rows["t"].append(i.strftime("%Y-%m-%d %H:00"))
        rows["tide"].append(r(pv - mhhw))
        rows["bg"].append(r(rm))
        rows["surge"].append(r(v - pv - rm))
        rows["days_minor"].append(int((dmax + adj_season >= minor).sum()))
        rows["days_minor_obs"].append(int((dmax >= minor).sum()))
    extremes[g["id"]] = dict(b_fc=r(b_fc), msl_epoch=r(dm["MSL"]), **rows)

    # declustered top events (at least 3 days apart), as measured and at 2027 sea level
    hh = obs.dropna()
    tq = tdec(hh.index)
    grid = np.arange(np.floor(tq.min()), 2027.5, 0.25)
    adj_all = b_fc - np.interp(tq, grid, B(grid))
    ev = {}
    for key, vals in [("obs", hh.values), ("adj", hh.values + adj_all)]:
        order = np.argsort(-vals)[:20000]
        chosen = []
        for j in order:
            tj = hh.index[j]
            if all(abs((tj - hh.index[c]).total_seconds()) > 3 * 86400 for c in chosen):
                chosen.append(j)
            if len(chosen) == 10:
                break
        lst = []
        for j in chosen:
            tj = hh.index[j]
            pv = pred.get(tj, np.nan)
            rm = rmon.get((tj.year, tj.month), np.nan)
            Ys = tj.year + (1 if tj.month >= 7 else 0)
            lst.append(dict(t=tj.strftime("%Y-%m-%d %H:00"), obs=r(hh.values[j] - mhhw), adj=r(hh.values[j] - mhhw + adj_all[j]),
                            tide=r(pv - mhhw), bg=r(rm), surge=r(hh.values[j] - pv - rm), Y=int(Ys), x=r(X.get(Ys, np.nan), 2)))
        ev[key] = lst
    top_events[g["id"]] = ev
    print(f"  {g['id']}: hourly {hourly_cov[g['id']]}, b_fc-MSLepoch {b_fc - dm['MSL']:.1f} cm, minor {g['flood']['minor']:.0f} cm above MHHW "
          f"({g['flood']['source']}), record {ev['obs'][0]['obs']} cm above MHHW on {ev['obs'][0]['t']}")

    # king tides, winter 2026-27 (local time): the higher high tide of each tidal day, i.e. every high tide that is
    # higher than the high tides before and after it (a calendar-day maximum would pick the lower high on days that
    # have only one high tide)
    if g["kind"] == "active":
        f = RAW / f"coops_kingtides/{sid}_hilo_MLLW.csv"
        if f.exists():
            k = pd.read_csv(f, skipinitialspace=True)
            k.columns = [c.strip() for c in k.columns]
            k["t"] = pd.to_datetime(k["Date Time"])
            k = k[k["Type"].astype(str).str.strip().str.startswith("H")].reset_index(drop=True)
            hv = k.Prediction.values
            keep = [(i == 0 or hv[i] >= hv[i - 1]) and (i == len(hv) - 1 or hv[i] >= hv[i + 1]) for i in range(len(hv))]
            k = k[keep]
            kingtides[g["id"]] = dict(t=[t.strftime("%Y-%m-%d %H:%M") for t in k.t], h=rl(k.Prediction.values * 100, 1),
                                      mllw=r(dm["MLLW"]), offset=r(b_fc - dm["MSL"]))

# regional highest water: mean across the long-running gauges reporting that winter
reg_h = []
for i, Y in enumerate(YEARS):
    v = [extremes[k]["hmax"][i] for k in REGION_MEMBERS if k in extremes and extremes[k]["hmax"][i] is not None]
    reg_h.append(r(np.mean(v)) if len(v) >= 2 else None)

# --------------------------------------------------------------------------------------------
# 5. Seasonal measures
# --------------------------------------------------------------------------------------------
MEASURES = {
    "djf": dict(label="Winter average", months="Dec–Feb", kind="mean", mons=[(-1, 12), (0, 1), (0, 2)]),
    "ndjfm": dict(label="November–March average", months="Nov–Mar", kind="mean", mons=[(-1, 11), (-1, 12), (0, 1), (0, 2), (0, 3)]),
    "peak": dict(label="Highest monthly average", months="Oct–Mar", kind="max", mons=[(-1, 10), (-1, 11), (-1, 12), (0, 1), (0, 2), (0, 3)]),
    "hmax": dict(label="Highest water of the winter", months="Nov–Mar", kind="hourly"),
}


def season_vals(a, mons, how):
    out = []
    for Y in YEARS:
        v = [a.get(pd.Timestamp(Y + oy, m, 1), np.nan) for oy, m in mons]
        v = np.array(v, float)
        if how == "mean":
            out.append(np.mean(v) if np.isfinite(v).all() else np.nan)
        else:
            out.append(np.nanmax(v) if np.isfinite(v).sum() >= len(v) - 1 else np.nan)
    return np.array(out)


SEAS = {}
ALLG = [g["id"] for g in GAUGES] + ["reg"]
for gid in ALLG:
    SEAS[gid] = {}
    for mk, md in MEASURES.items():
        if md["kind"] == "hourly":
            if gid == "reg":
                SEAS[gid][mk] = np.array([np.nan if v is None else v for v in reg_h], float)
            elif gid in extremes:
                SEAS[gid][mk] = np.array([np.nan if v is None else v for v in extremes[gid]["hmax"]], float)
            continue
        SEAS[gid][mk] = season_vals(ANOM[gid], md["mons"], md["kind"])

# --------------------------------------------------------------------------------------------
# 6. Statistical model: y = b0 + bLN*min(x,0) + bEN*max(x,0) + e, e ~ Normal(0, s), s larger in El Nino winters
# --------------------------------------------------------------------------------------------
print("Fitting models ...")


def mdesign(x, z=None):
    x = np.asarray(x, float)
    X_ = np.c_[np.ones_like(x), np.minimum(x, 0), np.maximum(x, 0)]
    return X_ if z is None else np.c_[X_, np.asarray(z, float)]


def sdesign(x):
    x = np.asarray(x, float)
    return np.c_[np.ones_like(x), (x >= 0.5).astype(float)]


def nll(p, Xm, Xs, y):
    k = Xm.shape[1]
    ls = Xs @ p[k:]
    return np.sum(ls + 0.5 * ((y - Xm @ p[:k]) / np.exp(ls)) ** 2)


def fit_model(x, y, p0=None, shared=False, z=None):
    Xm, Xs = mdesign(x, z), sdesign(x)
    k = Xm.shape[1]
    if shared:
        Xs = Xs * np.array([1.0, 0.0])
    if p0 is None:
        b = np.linalg.lstsq(Xm, y, rcond=None)[0]
        p0 = np.r_[b, np.log(np.std(y - Xm @ b) + 1e-3), 0.0]
    p = optimize.minimize(nll, p0, args=(Xm, Xs, y), method="BFGS").x
    if shared:
        p[k + 1] = 0.0
    return p


def predict(p, x, z=None):
    Xm = mdesign(x, z)
    k = Xm.shape[1]
    return Xm @ p[:k], np.exp(sdesign(x) @ p[k:])


def crps_norm(y, mu, s):
    zz = (y - mu) / s
    return s * (zz * (2 * stats.norm.cdf(zz) - 1) + 2 * stats.norm.pdf(zz) - 1 / np.sqrt(np.pi))


def bootstrap(x, y, est, shared, z=None):
    n = len(y)
    out, tries = [], 0
    while len(out) < NBOOT and tries < 20 * NBOOT:
        tries += 1
        idx = RNG.integers(0, n, n)
        if np.sum(x[idx] >= 0.5) < 3 or np.sum(x[idx] >= 1.5) < 1:
            continue
        out.append(fit_model(x[idx], y[idx], p0=est, shared=shared, z=None if z is None else z[idx]))
    return np.array(out)


def loo(x, y, est, shared, z=None, hind_from=None):
    n = len(y)
    cm, cc, hind = np.zeros(n), np.zeros(n), []
    for i in range(n):
        m = np.ones(n, bool)
        m[i] = False
        pe = fit_model(x[m], y[m], p0=est, shared=shared, z=None if z is None else z[m])
        mu, sd_ = predict(pe, x[i:i + 1], None if z is None else z[i:i + 1])
        cm[i] = crps_norm(y[i], mu[0], sd_[0])
        cc[i] = crps_norm(y[i], y[m].mean(), y[m].std(ddof=1))
        if hind_from is not None and x[i] >= 1.0:
            q = stats.norm.ppf([0.1, 0.5, 0.9], mu[0], sd_[0])
            hind.append([int(hind_from[i]), r(x[i], 2), r(y[i]), r(q[0]), r(q[1]), r(q[2]), r(stats.norm.cdf(y[i], mu[0], sd_[0]), 3)])
    return cm, cc, hind


def skill(cm, cc, x):
    def ss(mask):
        return r(1 - cm[mask].mean() / cc[mask].mean(), 3) if mask.sum() >= 3 else None
    return dict(all=ss(np.ones(len(x), bool)), en=ss(x >= 1.0), strong=ss(x >= 1.5))


# This fall's sea level (mean anomaly of September and October before each winter), an optional second predictor
FALL, FALL_NOW = {}, {}
for gid in ALLG:
    a = ANOM[gid]
    FALL[gid] = pd.Series([np.mean([a.get(pd.Timestamp(Y - 1, 9, 1), np.nan), a.get(pd.Timestamp(Y - 1, 10, 1), np.nan)]) for Y in YEARS],
                          index=YEARS)
    sep26 = a.get(pd.Timestamp(2026, 9, 1), np.nan)
    if gid in so_far and np.isfinite(sep26):
        FALL_NOW[gid] = float(np.mean([sep26, so_far[gid]["oct_anom"]]))
print("  fall (Sep-Oct 2026) anomaly:", {k: round(v, 1) for k, v in FALL_NOW.items()})


def project(boot, xs, z=None):
    k = 3 if z is None else 4
    bb = boot[RNG.integers(0, len(boot), len(xs))]
    mu = bb[:, 0] + bb[:, 1] * np.minimum(xs, 0) + bb[:, 2] * np.maximum(xs, 0) + (0 if z is None else bb[:, 3] * z)
    sd_ = np.exp(bb[:, k] + bb[:, k + 1] * (xs >= 0.5))
    return RNG.normal(mu, sd_)


models = {}
summary_rows = []
for gid in ALLG:
    models[gid] = {}
    for mk in MEASURES:
        if mk not in SEAS[gid]:
            continue
        models[gid][mk] = {}
        for per in ["modern", "long"]:
            j = pd.DataFrame(dict(y=SEAS[gid][mk], x=X.values, z=FALL[gid].values), index=YEARS).dropna(subset=["y", "x"])
            if per == "modern":
                j = j.loc[1951:]
            if len(j) < 15:
                continue
            yrs, x, y = j.index.values, j.x.values, j.y.values
            n = len(y)
            shared = np.sum(x >= 0.5) < 6
            est = fit_model(x, y, shared=shared)
            boot = bootstrap(x, y, est, shared)
            cm, cc, hind = loo(x, y, est, shared, hind_from=yrs)
            rho = stats.spearmanr(x, y).correlation
            M = dict(n=int(n), y0=int(yrs.min()), y1=int(yrs.max()), xmin=r(x.min(), 2), xmax=r(x.max(), 2), est=rl(est, 4),
                     boot=[r(v, 3) for v in boot.ravel()], shared=bool(shared), rho=r(rho, 2), skill=skill(cm, cc, x),
                     hind=hind, pit_in80=r(np.mean([(h[6] >= 0.1) and (h[6] <= 0.9) for h in hind]), 3) if hind else None)
            xs = RNG.normal(forecast["ndj_median"], forecast["ndj_sigma"], 60000)
            draws = project(boot, xs)
            qs = np.percentile(draws, [10, 25, 50, 75, 90])
            row = dict(gauge=gid, measure=mk, period=per, n=n, first=int(yrs.min()), last=int(yrs.max()),
                       b0=est[0], b_lanina=est[1], b_elnino=est[2], sd_other=np.exp(est[3]), sd_elnino=np.exp(est[3] + est[4]),
                       b_elnino_boot_p05=np.percentile(boot[:, 2], 5), b_elnino_boot_p95=np.percentile(boot[:, 2], 95),
                       spearman=rho, crpss_all=M["skill"]["all"], crpss_elnino=M["skill"]["en"], hindcast_cover80_elnino=M["pit_in80"],
                       record_cm=float(y.max()), record_season=f"{int(yrs[np.argmax(y)]) - 1}–{str(int(yrs[np.argmax(y)]))[2:]}",
                       proj_p10=qs[0], proj_p25=qs[1], proj_median=qs[2], proj_p75=qs[3], proj_p90=qs[4],
                       proj_p_above_zero=np.mean(draws > 0), proj_p_record=np.mean(draws > y.max()))
            # the same model plus this fall's sea level, compared on the same winters
            if gid in FALL_NOW:
                jz = j.dropna(subset=["z"])
                if len(jz) >= 15:
                    xz, yz, zz = jz.x.values, jz.y.values, jz.z.values
                    estz = fit_model(xz, yz, shared=shared, z=zz)
                    bootz = bootstrap(xz, yz, estz, shared, z=zz)
                    cmz, ccz, _ = loo(xz, yz, estz, shared, z=zz)
                    est0 = fit_model(xz, yz, shared=shared)
                    cm0, cc0, _ = loo(xz, yz, est0, shared)
                    M["fz"] = dict(n=int(len(yz)), est=rl(estz, 4), boot=[r(v, 3) for v in bootz.ravel()], z_now=r(FALL_NOW[gid]),
                                   skill=skill(cmz, ccz, xz), skill_enso_same=skill(cm0, cc0, xz))
                    dz = project(bootz, xs, FALL_NOW[gid])
                    row.update(fall_coef=estz[3], fall_now_cm=FALL_NOW[gid], crpss_all_with_fall=M["fz"]["skill"]["all"],
                               crpss_all_enso_same_years=M["fz"]["skill_enso_same"]["all"], proj_median_with_fall=np.median(dz),
                               proj_p10_with_fall=np.percentile(dz, 10), proj_p90_with_fall=np.percentile(dz, 90))
            models[gid][mk][per] = M
            summary_rows.append(row)
    print(f"  {gid:4s}", {mk: (models[gid][mk]['modern']['skill']['all'], r(models[gid][mk]['modern']['est'][2], 1),
                               models[gid][mk]['modern'].get('fz', {}).get('skill', {}).get('all'))
                          for mk in models[gid] if 'modern' in models[gid][mk]})
summary = pd.DataFrame(summary_rows)
summary.round(4).to_csv(OUT / "model_projection_summary.csv", index=False)
pd.set_option("display.width", 250)
print(summary[(summary.period == "modern")][[c for c in ["gauge", "measure", "n", "b_elnino", "sd_elnino", "spearman", "crpss_all", "crpss_elnino",
                                             "hindcast_cover80_elnino", "record_cm", "record_season", "proj_median", "proj_p10", "proj_p90",
                                             "fall_coef", "crpss_all_with_fall", "crpss_all_enso_same_years", "proj_median_with_fall"] if c in summary]].round(2).to_string())

# --------------------------------------------------------------------------------------------
# 7. Lag correlation between monthly sea level and the El Nino index (1951 onward)
# --------------------------------------------------------------------------------------------
LAGS = list(range(-6, 13))
lagcorr = {}
for gid in ALLG:
    a = ANOM[gid].loc["1951-01":"2026-09"]
    out = []
    for L in LAGS:
        xx = roni.copy()
        xx.index = xx.index + pd.DateOffset(months=L)
        j = pd.concat([a, xx], axis=1, sort=True).dropna()
        out.append(r(np.corrcoef(j.iloc[:, 0], j.iloc[:, 1])[0, 1], 3) if len(j) > 120 else None)
    lagcorr[gid] = out
print("  lag corr (reg):", dict(zip(LAGS, lagcorr["reg"])))
for gid in ["reg", "sd"]:
    a = ANOM[gid]
    print(f"  {gid} anomalies Jul-Oct of event years:", {y: [r(a.get(pd.Timestamp(y, m, 1), np.nan)) for m in (7, 8, 9, 10)] for y in [1957, 1972, 1982, 1997, 2015, 2023, 2026]})
    print(f"  {gid} highest DJF winters:", sorted([(r(v), f"{Y - 1}-{Y}") for Y, v in zip(YEARS, SEAS[gid]['djf']) if np.isfinite(v)], reverse=True)[:6])

# --------------------------------------------------------------------------------------------
# 8. The whole Pacific coast of the Americas: winter sea level in El Nino years
# --------------------------------------------------------------------------------------------
print("Pacific coast gauges ...")
# along-coast order, south to north. (id, source, code, short name, country)
COAST = [
    ("valp", "uh", 81, "Valparaíso", "Chile"), ("cald", "uh", 88, "Caldera", "Chile"), ("anto", "uh", 80, "Antofagasta", "Chile"),
    ("aric", "uh", 83, "Arica", "Chile"), ("mata", "uh", 94, "Matarani", "Peru"), ("call", "uh", 93, "Callao", "Peru"),
    ("pait", "uh", 678, "Paita", "Peru"), ("tala", "uh", 92, "Talara", "Peru"), ("lali", "uh", 91, "La Libertad", "Ecuador"),
    ("mant", "uh", 89, "Manta", "Ecuador"), ("esme", "uh", 98, "Esmeraldas", "Ecuador"), ("tuma", "uh", 303, "Tumaco", "Colombia"),
    ("buen", "uh", 85, "Buenaventura", "Colombia"), ("balb", "uh", 302, "Balboa", "Panama"), ("parm", "uh", 304, "Puerto Armuelles", "Panama"),
    ("quep", "uh", 87, "Quepos", "Costa Rica"), ("cori", "uh", 679, "Corinto", "Nicaragua"), ("acaj", "uh", 82, "Acajutla", "El Salvador"),
    ("sjos", "uh", 675, "San José", "Guatemala"), ("pque", "uh", 301, "Puerto Quetzal", "Guatemala"), ("scru", "uh", 394, "Salina Cruz", "Mexico"),
    ("acap", "uh", 316, "Acapulco", "Mexico"), ("manz", "uh", 395, "Manzanillo", "Mexico"), ("pval", "uh", 393, "Puerto Vallarta", "Mexico"),
    ("maza", "uh", 673, "Mazatlán", "Mexico"), ("cabo", "uh", 34, "Cabo San Lucas", "Mexico"), ("scar", "uh", 674, "San Carlos", "Mexico"),
    ("cedr", "uh", 305, "Isla de Cedros", "Mexico"), ("squi", "uh", 308, "San Quintín", "Mexico"), ("ense", "uh", 317, "Ensenada", "Mexico"),
    ("sd", "socal", None, "San Diego", "USA"), ("lj", "socal", None, "La Jolla", "USA"), ("la", "socal", None, "Los Angeles", "USA"),
    ("sm", "socal", None, "Santa Monica", "USA"), ("sb", "socal", None, "Santa Barbara", "USA"),
    ("psl", "co", "9412110", "Port San Luis", "USA"), ("mont", "co", "9413450", "Monterey", "USA"), ("sf", "co", "9414290", "San Francisco", "USA"),
    ("aren", "co", "9416841", "Arena Cove", "USA"), ("hum", "co", "9418767", "Humboldt Bay", "USA"), ("cres", "co", "9419750", "Crescent City", "USA"),
    ("porf", "co", "9431647", "Port Orford", "USA"), ("char", "co", "9432780", "Charleston", "USA"), ("sbea", "co", "9435380", "South Beach", "USA"),
    ("toke", "co", "9440910", "Toke Point", "USA"), ("neah", "co", "9443090", "Neah Bay", "USA"), ("tofi", "uh", 542, "Tofino", "Canada"),
    ("prup", "uh", 540, "Prince Rupert", "Canada"), ("ketc", "co", "9450460", "Ketchikan", "USA"), ("sitk", "co", "9451600", "Sitka", "USA"),
    ("yaku", "co", "9453220", "Yakutat", "USA"), ("cord", "co", "9454050", "Cordova", "USA"), ("sewa", "co", "9455090", "Seward", "USA"),
    ("kodi", "co", "9457292", "Kodiak", "USA"),
]
uh_meta = {}
f = RAW / "uhslc/rqds_stations.csv"
if f.exists():
    for _, row in pd.read_csv(f, skiprows=[1]).iterrows():
        lo = float(row.longitude)
        uh_meta[int(row.uhslc_id)] = (float(row.latitude), lo - 360 if lo > 180 else lo)
for line in open(RAW / "uhslc/fd_stations.csv").read().splitlines()[2:]:
    p = next(iter([line.split(",")]))
    try:
        u, la_, lo_ = int(p[0]), float(p[-2]), float(p[-1])
        uh_meta.setdefault(u, (la_, lo_ - 360 if lo_ > 180 else lo_))
    except ValueError:
        pass
all_stations = {}
for fn in ["stations_waterlevels.json", "stations_historicwl.json"]:
    for s in (jload(RAW / f"coops_meta/{fn}") or {}).get("stations", []):
        all_stations.setdefault(s["id"], s)

EVENTS = [1957, 1972, 1982, 1997, 2015, 2023, 2026]
coast = []
coast_hov = {y0: [] for y0 in EVENTS}
for cid, src, code, name, country in COAST:
    if src == "socal":
        a = ANOM[cid]
        g = next(gg for gg in GAUGES if gg["id"] == cid)
        lat, lon = g["lat"], g["lon"]
    else:
        s = read_uhslc_monthly(code) if src == "uh" else read_coops_monthly(code)[0] if (RAW / f"coops_monthly/mm_{code}.csv").exists() else None
        if s is None or len(s) < 180:
            print(f"  skip {name}: too short")
            continue
        a = decompose(s)["anom"]
        if src == "uh":
            lat, lon = uh_meta.get(code, (np.nan, np.nan))
        else:
            st = all_stations.get(code, {})
            lat, lon = st.get("lat", np.nan), st.get("lng", np.nan)
    aa = a.dropna()
    qa = dict(sd=round(float(aa.std()), 1), n_big=int((aa.abs() > 30).sum()), lo=round(float(aa.min()), 1), hi=round(float(aa.max()), 1))
    # a datum jump shows up as a long run of large anomalies of one sign: skip such records
    run = (aa.abs() > 15).astype(int)
    longest = int(run.groupby((run != run.shift()).cumsum()).sum().max())
    if qa["sd"] > 12 or longest >= 24:
        print(f"  skip {name}: suspect record {qa}, longest run beyond 15 cm = {longest} months")
        continue
    djf = pd.Series(season_vals(a, MEASURES["djf"]["mons"], "mean"), index=YEARS)
    j = pd.concat([djf.rename("y"), X.rename("x")], axis=1).loc[1951:LAST_YEAR].dropna()
    strong = j[j.x >= 1.5]
    vs = j[j.x >= 2.0]
    row = dict(id=cid, name=name, country=country, lat=r(lat, 3), lon=r(lon, 3), n=int(len(j)),
               first=a.dropna().index.min().year, last=a.dropna().index.max().strftime("%Y-%m"),
               strong=r(strong.y.mean()) if len(strong) >= 2 else None, nstrong=int(len(strong)),
               vstrong=r(vs.y.mean()) if len(vs) >= 1 else None, nvstrong=int(len(vs)),
               slope=r(np.polyfit(j.x, j.y, 1)[0]) if len(j) >= 15 else None,
               corr=r(np.corrcoef(j.x, j.y)[0, 1], 2) if len(j) >= 15 else None)
    if len(j) < 10 and row["strong"] is None:
        print(f"  skip {name}: no winters after 1951")
        continue
    coast.append(row)
    for y0 in EVENTS:
        idx = pd.date_range(f"{y0}-01-01", f"{y0 + 1}-06-01", freq="MS")
        v = a.reindex(idx)
        coast_hov[y0].append(rl(v.values) if v.notna().sum() >= (8 if y0 == 2026 else 12) else None)
print(f"  {len(coast)} coast gauges; strong-El Nino DJF anomaly:", {c['name']: c['strong'] for c in coast})

# --------------------------------------------------------------------------------------------
# 9. Satellite sea level maps (October and January), anomalies relative to the 1993-2009 AVISO climatology
# --------------------------------------------------------------------------------------------
print("Altimetry ...")


def load_nc(f, var):
    with xr.open_dataset(f) as d:
        v = d[var]
        if "time" in v.dims and v.sizes["time"] > 1:
            v = v.mean("time", skipna=True)
        return v.squeeze(drop=True).reset_coords(drop=True).load()


av = {}
for f in sorted((RAW / "altimetry").glob("aviso_*.nc")):
    ym = f.stem.split("_")[1]
    try:
        av[(int(ym[:4]), int(ym[4:]))] = load_nc(f, "ssh")
    except Exception as e:  # noqa: BLE001
        print("  bad", f.name, e)
alt_maps = []
alt_lat = alt_lon = None
n_clim = {m: sum(1 for (y, mm) in av if mm == m) for m in range(1, 13)}
if av and min(n_clim.values()) >= 5:
    ref = next(iter(av.values()))
    alt_lat, alt_lon = ref.latitude.values, ref.longitude.values
    clim = {m: xr.concat([v for (y, mm), v in av.items() if mm == m], "k").mean("k") for m in range(1, 13)
            if sum(1 for (y, mm) in av if mm == m) >= 5}
    ann = xr.concat(list(clim.values()), "k").mean("k")
    seas_anom = {m: clim[m] - ann for m in clim}

    def pack(arr, label, year, month, src):
        a = np.asarray(arr) * 1000.0
        ok = np.isfinite(a)
        coslat_ = np.cos(np.deg2rad(alt_lat))[:, None] * np.ones_like(a)
        mean = float(np.nansum(a * coslat_ * ok) / np.sum(coslat_ * ok))
        grid = [[None if not np.isfinite(v) else int(round(v)) for v in row] for row in a]   # mm
        alt_maps.append(dict(label=label, year=year, month=month, source=src, mean=r(mean / 10.0), grid=grid))

    for (y, m), lab in [((1997, 10), "Oct 1997"), ((1998, 1), "Jan 1998")]:
        if (y, m) in av and m in clim:
            pack((av[(y, m)] - clim[m]).values, lab, y, m, "AVISO")
    for (y, m), lab in [((2015, 10), "Oct 2015"), ((2016, 1), "Jan 2016"), ((2023, 10), "Oct 2023"), ((2024, 1), "Jan 2024"),
                        ((2026, 9), "Sep 2026"), ((2026, 10), "Oct 2026")]:
        f = RAW / f"altimetry/blended_{y}{m:02d}.nc"
        if not f.exists() or m not in seas_anom:
            continue
        v = load_nc(f, "sla")
        v = v.assign_coords(longitude=np.where(v.longitude < 0, v.longitude + 360, v.longitude)).sortby("longitude")
        v = v.interp(latitude=alt_lat, longitude=alt_lon, method="nearest")
        pack((v - seas_anom[m]).values, lab if (y, m) != (2026, 10) else "Oct 2026 (to Oct 25)", y, m, "NOAA blended")
    alt_maps.sort(key=lambda d: (-d["year"] if d["year"] >= 2026 else 0, -d["year"], d["month"]))
    print("  maps:", [(d["label"], d["mean"]) for d in alt_maps])
else:
    print("  skipped: AVISO climatology incomplete", n_clim)

# --------------------------------------------------------------------------------------------
# 10. Map geometry: Southern California gauge map and Pacific coast map (Natural Earth)
# --------------------------------------------------------------------------------------------
print("Maps ...")
from shapely.geometry import shape, box as sbox

INVENTORY = []
for sid in ["9410025", "9410032", "9410079", "9410120", "9410135", "9410155", "9410170", "9410179", "9410196", "9410230", "9410302",
            "9410396", "9410580", "9410650", "9410660", "9410678", "9410680", "9410738", "9410840", "9410962", "9410971", "9411013",
            "9411270", "9411340", "9411399", "9411406"]:
    st = all_stations.get(sid)
    f = RAW / f"coops_monthly/mm_{sid}.csv"
    n, y0, y1 = 0, None, None
    if f.exists():
        try:
            s, _ = read_coops_monthly(sid)
            n = int(len(s))
            if n:
                y0, y1 = s.index.min().strftime("%Y-%m"), s.index.max().strftime("%Y-%m")
        except Exception:  # noqa: BLE001
            pass
    if st is None:
        continue
    used = next((g["id"] for g in GAUGES if g.get("coops") == sid), None)
    INVENTORY.append(dict(src="NOAA CO-OPS", code=sid, name=st["name"].title().replace("Is.", "Island").replace("Est.", "Estuary"),
                          lat=round(st["lat"], 4), lon=round(st["lng"], 4), n=n, first=y0, last=y1, used=used))
for pid in [717, 883, 1457, 1430, 1413, 795, 2512]:
    s = read_psmsl(pid)
    mt = psmsl_meta[pid]
    INVENTORY.append(dict(src="PSMSL", code=str(pid), name=mt["name"].replace("Ii", "II"), lat=round(mt["lat"], 4), lon=round(mt["lon"], 4),
                          n=int(len(s)), first=s.index.min().strftime("%Y-%m"), last=s.index.max().strftime("%Y-%m"),
                          used="en" if pid == 795 else None))
s = read_uhslc_monthly(313)
if s is not None:
    INVENTORY.append(dict(src="UHSLC", code="313", name="Catalina Island (Avalon area)", lat=33.45, lon=-118.483, n=int(len(s)),
                          first=s.index.min().strftime("%Y-%m"), last=s.index.max().strftime("%Y-%m"), used=None))
for g in GAUGES:
    if g["id"] == "en":
        g["lat"], g["lon"] = round(psmsl_meta[795]["lat"], 4), round(psmsl_meta[795]["lon"], 4)
INVENTORY.sort(key=lambda d: -d["lat"])


def land_paths(fn, bb, proj, simplify=0.0):
    land = json.load(open(RAW / f"naturalearth/{fn}"))
    clip = sbox(*bb)
    out = []
    for ft in land["features"]:
        geom = shape(ft["geometry"])
        if not geom.intersects(clip):
            continue
        gg = geom.intersection(clip)
        if simplify:
            gg = gg.simplify(simplify, preserve_topology=True)
        polys = [gg] if gg.geom_type == "Polygon" else [q for q in getattr(gg, "geoms", []) if q.geom_type == "Polygon"]
        for poly in polys:
            for ring in [poly.exterior] + list(poly.interiors):
                c = np.asarray(ring.coords)
                if len(c) < 4:
                    continue
                xy = [proj(lo, la) for lo, la in c]
                out.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in xy) + "Z")
    return "".join(out)


# Southern California (equirectangular, scaled by cos 33.5N)
SC_BB = (-120.9, 32.35, -116.75, 34.85)
SC_W = 960.0
kx = np.cos(np.deg2rad(33.5))
sc_scale = SC_W / ((SC_BB[2] - SC_BB[0]) * kx)
SC_H = (SC_BB[3] - SC_BB[1]) * sc_scale
sc_proj = lambda lo, la: ((lo - SC_BB[0]) * kx * sc_scale, (SC_BB[3] - la) * sc_scale)  # noqa: E731
socal_map = dict(w=SC_W, h=round(SC_H, 1), bb=SC_BB, kx=kx, land=land_paths("ne_10m_land.geojson", SC_BB, sc_proj, 0.004))
# Pacific coast of the Americas (equirectangular)
PC_BB = (-166.0, -36.0, -66.0, 62.0)
PC_W = 600.0
pc_scale = PC_W / (PC_BB[2] - PC_BB[0])
pc_proj = lambda lo, la: ((lo - PC_BB[0]) * pc_scale, (PC_BB[3] - la) * pc_scale)  # noqa: E731
pac_map = dict(w=PC_W, h=round((PC_BB[3] - PC_BB[1]) * pc_scale, 1), bb=PC_BB, land=land_paths("ne_50m_land.geojson", PC_BB, pc_proj, 0.08))
# coastlines for the satellite maps, in (lon - 180, 60 - lat) degree units
alt_coast = ""
if alt_lat is not None:
    alt_coast = land_paths("ne_50m_land.geojson", (-180, -31, -69, 61), lambda lo, la: (lo + 180, 60.5 - la), 0.05)

# --------------------------------------------------------------------------------------------
# 11. High tide flooding counts from NOAA (for reference) and outputs
# --------------------------------------------------------------------------------------------
htf = {}
for g in GAUGES:
    if "coops" not in g:
        continue
    d = jload(RAW / f"coops_meta/htf_annual_{g['coops']}.json")
    if d and d.get("AnnualFloodCount"):
        htf[g["id"]] = [[x["year"], x["minCount"], x["modCount"], x["majCount"]] for x in d["AnnualFloodCount"]]
    o = jload(RAW / f"coops_meta/htf_outlook_{g['coops']}.json")
    if o and o.get("MetYearAnnualOutlook"):
        last = o["MetYearAnnualOutlook"][-1]
        g["htf_outlook"] = dict(year=last["metYear"], low=last["lowConf"], high=last["highConf"], method=last.get("projectMethod"),
                                date=last.get("projectDate"))

print("Writing ...")
gauges_out = []
for g in GAUGES:
    keep = {k: g.get(k) for k in ["id", "kind", "name", "sub", "lat", "lon", "first", "last", "nmonths", "trend_full", "trend_recent",
                                  "datums", "flood", "htf_outlook", "rise_since", "tide_max"]}
    keep["coops"] = g.get("coops")
    keep["psmsl"] = g.get("psmsl")
    keep["hourly"] = hourly_cov.get(g["id"])
    gauges_out.append(keep)
gauges_out.insert(0, dict(REGION, lat=None, lon=None, coops=None, psmsl=None, hourly=None))


def pack_monthly(a):
    a = a.dropna()
    idx = pd.date_range(a.index.min(), a.index.max(), freq="MS")
    return dict(t0=idx[0].strftime("%Y-%m"), v=rl(a.reindex(idx).values))


rm_idx = roni.loc["1900-01":]
data = dict(
    meta=dict(generated=BUILT, nboot=NBOOT, last_year=LAST_YEAR, fc_year=FC_YEAR, recon=recon_stats, win=WIN, t_fc=T_FC),
    current=current, forecast=forecast,
    cats=[dict(id=c[0], label=c[1], lo=c[2], hi=c[3]) for c in CATS],
    measures={k: dict(label=v["label"], months=v["months"], kind=v["kind"]) for k, v in MEASURES.items()},
    gauges=gauges_out, years=YEARS.tolist(), roni=rl(X.values, 2), oni=rl(oni_ndj.reindex(YEARS).values, 2),
    roni_monthly=dict(t0=rm_idx.index[0].strftime("%Y-%m"), v=rl(rm_idx.values, 2)),
    monthly={gid: pack_monthly(ANOM[gid]) for gid in ALLG},
    seas={gid: {mk: rl(v) for mk, v in SEAS[gid].items()} for gid in ALLG},
    models=models, lags=LAGS, lagcorr=lagcorr, extremes=extremes, top=top_events, kingtides=kingtides, so_far=so_far, htf=htf,
    seas_cycle={g["id"]: rl(dec[g["id"]]["seas"]) for g in GAUGES},
    coast=dict(stations=coast, events=EVENTS, hov={str(k): v for k, v in coast_hov.items()}),
    inventory=INVENTORY,
)
with open(OUT / "sl_data.js", "w") as f:
    f.write(f"// Derived data for index.html - generated by analysis/build_site_data.py on {BUILT}\n")
    f.write("window.SL_DATA = ")
    json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    f.write(";\n")
geo = dict(socal=socal_map, pacific=pac_map,
           alt=dict(lat=rl(alt_lat, 3) if alt_lat is not None else [], lon=rl(alt_lon, 3) if alt_lon is not None else [],
                    maps=alt_maps, coast=alt_coast))
with open(OUT / "sl_geo.js", "w") as f:
    f.write(f"// Derived map data for index.html - generated by analysis/build_site_data.py on {BUILT}\n")
    f.write("window.SL_GEO = ")
    json.dump(geo, f, separators=(",", ":"), ensure_ascii=False)
    f.write(";\n")

# tidy CSVs
rows = []
for gid in ALLG:
    for i, Y in enumerate(YEARS):
        rec = dict(season_year=int(Y), season_label=f"{Y - 1}–{str(Y)[2:]}", gauge=gid, ndj_roni=r(X.iloc[i], 2),
                   roni_source="CPC official" if Y >= 1951 else "ERSSTv5 reconstruction", enso_category=category(X.iloc[i]))
        have = False
        for mk in MEASURES:
            v = SEAS[gid].get(mk, np.full(len(YEARS), np.nan))[i]
            rec[{"djf": "djf_anom_cm", "ndjfm": "ndjfm_anom_cm", "peak": "peak_month_anom_cm", "hmax": "highest_water_above_mhhw_at_2027_level_cm"}[mk]] = r(v)
            have = have or np.isfinite(v)
        if gid in extremes:
            rec["highest_water_above_mhhw_as_measured_cm"] = extremes[gid]["hmax_obs"][i]
            rec["highest_water_time_utc"] = extremes[gid]["t"][i]
            rec["days_above_minor_flood_at_2027_level"] = extremes[gid]["days_minor"][i]
        if have:
            rows.append(rec)
pd.DataFrame(rows).to_csv(OUT / "seasonal_sea_level_enso.csv", index=False)
mrows = []
for gid in ALLG:
    for t, v in ANOM[gid].dropna().items():
        mrows.append(dict(gauge=gid, month=t.strftime("%Y-%m"), anomaly_cm=round(float(v), 1)))
pd.DataFrame(mrows).to_csv(OUT / "monthly_sea_level_anomalies.csv", index=False)
pd.DataFrame(INVENTORY).to_csv(OUT / "gauge_inventory.csv", index=False)
pd.DataFrame(coast).to_csv(OUT / "pacific_coast_enso_sensitivity.csv", index=False)
kt = []
for gid, k in kingtides.items():
    for t, h in zip(k["t"], k["h"]):
        kt.append(dict(gauge=gid, local_time=t, predicted_tide_ft_mllw=round(h / 30.48, 2), predicted_tide_m_mllw=round(h / 100, 3),
                       sea_level_rise_since_1983_2001_epoch_cm=k["offset"]))
pd.DataFrame(kt).to_csv(OUT / "king_tides_2026_27.csv", index=False)
pd.DataFrame(dict(season_year=YEARS, season_label=[f"{Y - 1}–{str(Y)[2:]}" for Y in YEARS], ndj_roni=X.values,
                  source=["CPC official" if Y >= 1951 else "ERSSTv5 reconstruction" for Y in YEARS],
                  ndj_oni_traditional=oni_ndj.reindex(YEARS).values)).round(2).to_csv(OUT / "enso_ndj_index.csv", index=False)
pd.DataFrame(fc_table).to_csv(OUT / "cpc_roni_outlook_oct2026.csv", index=False)
for fn in ["sl_data.js", "sl_geo.js"]:
    print(f"  {fn}: {(OUT / fn).stat().st_size / 1e3:.0f} kB")
print("done")
