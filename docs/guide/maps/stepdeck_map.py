"""stepdeck_map.py: write a grid of values as a stepdeck raster file.

A stepdeck `map` layer reads a raster as one JSON file and greyscale PNGs beside it (`raster: "data/density.json"`).
These two functions write exactly that, from the code that makes your maps. Copy this file into your project and
import it; it belongs to your project from then on. The grid writer needs only the Python standard library (3.9 or
later); `write_stepdeck_raster` also needs rasterio, and is untested in the stepdeck repository.

    write_stepdeck_grid(path, grid, bounds, value=None, labels=None, numbers=None)

        path     the JSON to write, such as "my-talk/data/density.json". The PNG goes beside it (density.png); the
                 frames of a time-lapse go in a folder of the same name (density/001.png, density/002.png, ...).
        grid     rows of cells, north to south, each row west to east: nested lists or anything with .tolist() (a
                 NumPy array). None or NaN is no data. A list of such grids, all one size, is a time-lapse, one grid
                 per frame (so is a 3-D array, frames first).
        bounds   [west, south, east, north] in degrees: the outer edges of the edge cells.
        value    what the grey levels mean:
                   None (the default)                  linear over the data's range, every frame together
                   {"scale": "linear", "min", "max"}   a fixed range; a value outside it is written as the nearer end
                   {"scale": "log", "min", "max"}      a log scale; every value must be above 0
                   {"classes": ["Forest", "Urban"]}    the cells hold class names; one class is a mask
                 "min" and "max" may be left out, and are then the data's. Other keys, such as "unit", are kept.
        labels   a time-lapse's frame labels, one per frame, unique: the slide's `frame` names them.
        numbers  a time-lapse's numbers for the slide's panel: {"people": [1200000, 1250000, ...]}, one value per frame.

    write_stepdeck_raster(path, source, value=None, labels=None, numbers=None)

        The same for a rasterio dataset, or a list of them, in EPSG:4326: every band of every dataset, in order, is a
        frame, and a single band is a single raster.

A value v is stored as the grey level floor((v - min) / (max - min) * 255 + 0.5) (log: floor(log(v / min) / log(max /
min) * 255 + 0.5)), which the map reads back as min + level / 255 * (max - min) (log: min * (max / min) ** (level /
255)). No data is transparent. The PNGs are 8-bit greyscale, with alpha only where there is no data, and no colour
chunks: the raster format of "From your analysis code to a map slide" in the stepdeck docs, which `stepdeck validate`
checks.
"""
import json
import math
import os
import struct
import zlib

__all__ = ["write_stepdeck_grid", "write_stepdeck_raster"]


def write_stepdeck_grid(path, grid, bounds, value=None, labels=None, numbers=None):
    """Writes `grid` (or a list of grids, one per frame) as the raster JSON `path` and its PNGs. Returns `path`.

    Everything is checked before anything is written: a call that raises ValueError leaves no file behind."""
    if not path.endswith(".json"):
        raise ValueError("`path` must end in .json")
    bounds = _bounds(bounds)
    frames, lapse = _frames(grid)
    if not lapse and (labels is not None or numbers is not None):
        raise ValueError("`labels` and `numbers` are for a time-lapse: pass a list of grids")
    if lapse:
        labels = [_text(label) for label in ([] if labels is None else labels)]
        if len(labels) != len(frames) or len(set(labels)) != len(labels) or "" in labels:
            raise ValueError("a time-lapse needs `labels`: one per frame, unique and not empty")
        numbers = {key: [_plain(v) for v in values] for key, values in (numbers or {}).items()}
        if any(len(values) != len(frames) or not all(_finite(v) for v in values) for values in numbers.values()):
            raise ValueError("`numbers` needs one finite number per frame for every key")
    value, levels = _levels(frames, dict(value or {"scale": "linear"}))

    folder, name = os.path.split(path[: -len(".json")])
    os.makedirs(folder or ".", exist_ok=True)
    sidecar = {"bounds": bounds, "value": value}
    if not lapse:
        sidecar["src"] = name + ".png"
        _png(os.path.join(folder, sidecar["src"]), levels[0])
    else:
        os.makedirs(os.path.join(folder, name), exist_ok=True)
        sidecar["frames"] = []
        for i, frame_levels in enumerate(levels):
            src = "%s/%03d.png" % (name, i + 1)
            _png(os.path.join(folder, src), frame_levels)
            frame = {"src": src, "label": labels[i]}
            if numbers:
                frame["numbers"] = {key: values[i] for key, values in numbers.items()}
            sidecar["frames"].append(frame)
    with open(path, "w", encoding="utf-8") as out:
        json.dump(sidecar, out, indent=2, ensure_ascii=False, allow_nan=False)
        out.write("\n")
    return path


def write_stepdeck_raster(path, source, value=None, labels=None, numbers=None):
    """Writes rasterio dataset(s) in EPSG:4326 with `write_stepdeck_grid`: every band is a frame. Returns `path`."""
    sources = list(source) if isinstance(source, (list, tuple)) else [source]
    for ds in sources:
        if ds.crs is None or ds.crs.to_epsg() != 4326:
            raise ValueError("reproject the raster to EPSG:4326 first (rasterio.warp.reproject)")
        if tuple(ds.bounds) != tuple(sources[0].bounds):
            raise ValueError("every dataset must have the same bounds")
    grids = [ds.read(band, masked=True).astype("float64").filled(math.nan) for ds in sources for band in range(1, ds.count + 1)]
    return write_stepdeck_grid(path, grids if len(grids) > 1 else grids[0], list(sources[0].bounds), value, labels, numbers)


# --- inside -----------------------------------------------------------------------------------------------------------


def _plain(x):
    """A NumPy scalar or array as plain Python; anything else as it is."""
    return x.tolist() if hasattr(x, "tolist") else x


def _missing(v):
    """No data: None or NaN."""
    return v is None or (isinstance(v, float) and math.isnan(v))


def _finite(v):
    """A finite number (not a bool)."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _text(v):
    """A class name or a label as text, written as R's as.character writes it: 2.0 is "2", True is "TRUE"."""
    v = _plain(v)
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _where(frame, row, col, lapse):
    """A cell's place in a message, counted from 1."""
    return "(frame %d, row %d, column %d)" % (frame + 1, row + 1, col + 1) if lapse else "(row %d, column %d)" % (row + 1, col + 1)


def _bounds(bounds):
    """`bounds` as four plain numbers, if they describe a box in degrees."""
    b = [_plain(x) for x in bounds]
    if not (len(b) == 4 and all(_finite(x) for x in b) and b[0] < b[2] and b[1] < b[3] and -180 <= b[0] and b[2] <= 180 and -90 <= b[1] and b[3] <= 90):
        raise ValueError("`bounds` must be west, south, east, north in degrees: four finite numbers, with west < east and south < north, within -180 to 180 and -90 to 90")
    return b


def _frames(grid):
    """The frames of `grid` as lists of rows of plain cells, all one size, and whether it is a time-lapse."""
    grid = [_plain(item) for item in _plain(grid)]
    lapse = bool(grid) and isinstance(grid[0], (list, tuple)) and bool(grid[0]) and isinstance(_plain(grid[0][0]), (list, tuple))
    frames = [[list(_plain(row)) for row in frame] for frame in (grid if lapse else [grid])]
    rows = len(frames[0]) if frames else 0
    cols = len(frames[0][0]) if rows else 0
    if cols == 0 or any(len(frame) != rows or any(len(row) != cols for row in frame) for frame in frames):
        raise ValueError("every frame must be a grid of one size, with at least one cell")
    return frames, lapse


def _cells(frames):
    """Every cell with data, row by row and frame by frame: (frame, row, column, value)."""
    for f, frame in enumerate(frames):
        for r, row in enumerate(frame):
            for c, v in enumerate(row):
                if not _missing(v):
                    yield f, r, c, v


def _levels(frames, value):
    """The sidecar's `value`, completed, and each frame as rows of levels 0 to 255 (None for no data)."""
    lapse = len(frames) > 1
    if "classes" in value:
        if "scale" in value:
            raise ValueError("`value` takes `classes` or `scale`, not both")
        classes = value["classes"]
        classes = [classes] if isinstance(classes, str) else list(_plain(classes))
        if not 1 <= len(classes) <= 256:
            raise ValueError("`classes` must list 1 to 256 names")
        if any(_missing(name) for name in classes):
            raise ValueError("class names must not be empty")
        names = [_text(name) for name in classes]
        if "" in names:
            raise ValueError("class names must not be empty")
        twice = [name for i, name in enumerate(names) if name in names[:i]]
        if twice:
            raise ValueError("class names must be unique (found '%s' twice)" % twice[0])
        index = {name: i for i, name in enumerate(names)}
        for f, r, c, v in _cells(frames):
            if _text(v) not in index:
                raise ValueError("'%s' is not one of `classes`: with `classes`, cells hold class names %s" % (_text(v), _where(f, r, c, lapse)))
        value["classes"] = names
        return value, [[[None if _missing(v) else index[_text(v)] for v in row] for row in frame] for frame in frames]

    scale = value.get("scale", "linear")
    if scale not in ("linear", "log"):
        raise ValueError('`scale` must be "linear" or "log"')
    for f, r, c, v in _cells(frames):
        if not _finite(v):
            raise ValueError("cells must be finite numbers, or NA, None or NaN for no data %s" % _where(f, r, c, lapse))
    if scale == "log":
        for f, r, c, v in _cells(frames):
            if v <= 0:
                raise ValueError("a log scale needs every value above 0 %s" % _where(f, r, c, lapse))
    data = [v for _, _, _, v in _cells(frames)]
    if not data:
        raise ValueError("the grid has no data")
    lo = _plain(value.get("min", min(data)))
    hi = _plain(value.get("max", max(data)))
    if not (_finite(lo) and _finite(hi)):
        raise ValueError("`min` and `max` must be finite numbers")
    if not lo < hi:
        raise ValueError("`min` must be less than `max` (are all the values equal? then give `value` with `min` and `max`)")
    if scale == "log" and not lo > 0:
        raise ValueError("a log scale needs `min` above 0")
    if not math.isfinite(hi - lo if scale == "linear" else hi / lo):
        raise ValueError("`min` and `max` are too far apart to compute levels")
    rest = {key: v for key, v in value.items() if key not in ("scale", "min", "max")}
    value = dict({"scale": scale, "min": lo, "max": hi}, **rest)

    if scale == "log":
        def share(v):
            q = v / lo  # 0 when v is far below min: log would refuse it
            return -math.inf if q == 0 else math.log(q) / math.log(hi / lo)
    else:
        def share(v):
            return (v - lo) / (hi - lo)

    def level(v):  # a value past the range is written at its nearer end
        if _missing(v):
            return None
        g = share(v) * 255 + 0.5
        return 0 if g < 1 else 255 if g >= 255 else math.floor(g)

    return value, [[[level(v) for v in row] for row in frame] for frame in frames]


def _png(file, rows):
    """An 8-bit greyscale PNG of `rows` (levels, None for no data): with alpha only when some cell has no data."""
    alpha = any(v is None for row in rows for v in row)
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type 0: the samples as they are
        for v in row:
            if alpha:
                raw += b"\x00\x00" if v is None else bytes((v, 255))
            else:
                raw.append(v)
    header = struct.pack(">IIBBBBB", len(rows[0]), len(rows), 8, 4 if alpha else 0, 0, 0, 0)
    with open(file, "wb") as out:
        out.write(b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", header) + _chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + _chunk(b"IEND", b""))


def _chunk(kind, body):
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
