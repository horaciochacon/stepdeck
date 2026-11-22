# stepdeck-map.R: write a grid of values as a stepdeck raster file.
#
# A stepdeck `map` layer reads a raster as one JSON file and greyscale PNGs beside it (`raster: "data/density.json"`).
# These two functions write exactly that, from the code that makes your maps. Copy this file into your project and
# source() it; it belongs to your project from then on. The grid writer needs the png and jsonlite packages;
# write_stepdeck_raster also needs terra, and is untested in the stepdeck repository.
#
#   write_stepdeck_grid(m, bounds, path, value = NULL, labels = NULL, numbers = NULL)
#
#     m        a matrix, rows north to south and columns west to east, NA for no data. A list of matrices of one size
#              is a time-lapse, one matrix per frame.
#     bounds   c(west, south, east, north) in degrees: the outer edges of the edge cells.
#     path     the JSON to write, such as "my-talk/data/density.json". The PNG goes beside it (density.png); the frames
#              of a time-lapse go in a folder of the same name (density/001.png, density/002.png, ...).
#     value    what the grey levels mean:
#                NULL (the default)                     linear over the data's range, every frame together
#                list(scale = "linear", min =, max =)   a fixed range; a value outside it is written as the nearer end
#                list(scale = "log", min =, max =)      a log scale; every value must be above 0
#                list(classes = c("Forest", "Urban"))   the cells hold class names; one class is a mask
#              min and max may be left out, and are then the data's. Other fields, such as unit, are kept.
#     labels   a time-lapse's frame labels, one per frame, unique: the slide's `frame` names them. Default: names(m).
#     numbers  a time-lapse's numbers for the slide's panel: a named list (or a data frame) of numeric vectors, one
#              value per frame, such as list(people = c(1200000, 1250000)).
#
#   write_stepdeck_raster(r, path, value = NULL, labels = NULL, numbers = NULL)
#
#     The same for a terra SpatRaster in longitude/latitude (EPSG:4326): one layer per frame, a single layer for a
#     single raster. Labels default to the layer names.
#
# A value v is stored as the grey level floor((v - min) / (max - min) * 255 + 0.5) (log: floor(log(v / min) /
# log(max / min) * 255 + 0.5)), which the map reads back as min + level / 255 * (max - min) (log: min * (max / min) ^
# (level / 255)). No data is transparent. The PNGs are 8-bit greyscale, with alpha only where there is no data, and no
# colour chunks: the raster format of "From your analysis code to a map slide" in the stepdeck docs, which
# `stepdeck validate` checks.

write_stepdeck_grid <- function(m, bounds, path, value = NULL, labels = NULL, numbers = NULL) {
  # Everything is checked before anything is written: a call that stops leaves no file behind.
  if (!grepl("\\.json$", path)) stop("`path` must end in .json")
  b <- bounds
  if (!(is.numeric(b) && length(b) == 4 && all(is.finite(b)) && b[1] < b[3] && b[2] < b[4] &&
        b[1] >= -180 && b[3] <= 180 && b[2] >= -90 && b[4] <= 90)) {
    stop("`bounds` must be west, south, east, north in degrees: four finite numbers, with west < east and south < north, within -180 to 180 and -90 to 90")
  }
  lapse <- is.list(m)
  frames <- if (lapse) m else list(m)
  size <- if (length(frames) && is.matrix(frames[[1]])) dim(frames[[1]]) else c(0, 0)
  if (prod(size) == 0 || !all(vapply(frames, function(f) is.matrix(f) && identical(dim(f), size), logical(1)))) {
    stop("every frame must be a grid of one size, with at least one cell")
  }
  if (!lapse && (!is.null(labels) || !is.null(numbers))) stop("`labels` and `numbers` are for a time-lapse: pass a list of grids")
  if (lapse) {
    labels <- as.character(if (is.null(labels)) names(m) else labels)
    if (length(labels) != length(frames) || anyDuplicated(labels) || any(is.na(labels) | labels == "")) {
      stop("a time-lapse needs `labels`: one per frame, unique and not empty")
    }
    for (n in numbers) {
      if (length(n) != length(frames) || !is.numeric(n) || !all(is.finite(n))) stop("`numbers` needs one finite number per frame for every key")
    }
  }
  scaled <- .stepdeck_levels(frames, if (is.null(value)) list(scale = "linear") else value, lapse)

  folder <- dirname(path)
  name <- sub("\\.json$", "", basename(path))
  dir.create(folder, recursive = TRUE, showWarnings = FALSE)
  sidecar <- list(bounds = I(as.numeric(bounds)), value = scaled$value)
  if (!lapse) {
    sidecar$src <- paste0(name, ".png")
    .stepdeck_png(scaled$levels[[1]], file.path(folder, sidecar$src))
  } else {
    dir.create(file.path(folder, name), showWarnings = FALSE)
    sidecar$frames <- lapply(seq_along(frames), function(i) {
      src <- sprintf("%s/%03d.png", name, i)
      .stepdeck_png(scaled$levels[[i]], file.path(folder, src))
      frame <- list(src = src, label = labels[i])
      if (length(numbers)) frame$numbers <- lapply(numbers, function(n) n[[i]])
      frame
    })
  }
  # digits = NA keeps every digit of min and max; I() keeps one-element arrays (bounds, a mask's classes) arrays
  jsonlite::write_json(sidecar, path, auto_unbox = TRUE, digits = NA, pretty = TRUE)
  invisible(path)
}

write_stepdeck_raster <- function(r, path, value = NULL, labels = NULL, numbers = NULL) {
  if (!terra::is.lonlat(r)) stop("project the raster to longitude/latitude first: terra::project(r, \"EPSG:4326\")")
  m <- lapply(seq_len(terra::nlyr(r)), function(i) terra::as.matrix(r[[i]], wide = TRUE))
  if (length(m) == 1) m <- m[[1]] else names(m) <- names(r)
  e <- as.vector(terra::ext(r))
  write_stepdeck_grid(m, unname(e[c("xmin", "ymin", "xmax", "ymax")]), path, value, labels, numbers)
}

# --- inside -----------------------------------------------------------------------------------------------------------

# The first cell, row by row and frame by frame, where bad(frame) is TRUE: c(frame, row, column), or NULL.
.stepdeck_first <- function(frames, bad) {
  for (i in seq_along(frames)) {
    at <- which(t(bad(frames[[i]])))[1] # t(): which() then counts row by row
    if (!is.na(at)) return(c(i, (at - 1) %/% ncol(frames[[i]]) + 1, (at - 1) %% ncol(frames[[i]]) + 1))
  }
  NULL
}

# A cell's place in a message, counted from 1.
.stepdeck_where <- function(cell, lapse) {
  if (lapse) sprintf("(frame %d, row %d, column %d)", cell[1], cell[2], cell[3]) else sprintf("(row %d, column %d)", cell[2], cell[3])
}

# The sidecar's `value`, completed, and each frame as a matrix of levels 0 to 255 (NA for no data).
.stepdeck_levels <- function(frames, value, lapse) {
  if (!is.null(value$classes)) {
    if (!is.null(value$scale)) stop("`value` takes `classes` or `scale`, not both")
    classes <- unlist(value$classes)
    if (length(classes) < 1 || length(classes) > 256) stop("`classes` must list 1 to 256 names")
    classes <- as.character(classes)
    if (any(is.na(classes) | classes == "")) stop("class names must not be empty")
    twice <- classes[duplicated(classes)]
    if (length(twice)) stop("class names must be unique (found '", twice[1], "' twice)")
    text <- function(f) matrix(as.character(f), nrow(f), ncol(f)) # cells match class names as text
    cell <- .stepdeck_first(frames, function(f) !is.na(f) & is.na(matrix(match(text(f), classes), nrow(f), ncol(f))))
    if (!is.null(cell)) {
      stop("'", text(frames[[cell[1]]])[cell[2], cell[3]], "' is not one of `classes`: with `classes`, cells hold class names ", .stepdeck_where(cell, lapse))
    }
    levels <- lapply(frames, function(f) matrix(match(text(f), classes) - 1L, nrow(f), ncol(f)))
    value$classes <- I(classes)
    return(list(value = value, levels = levels))
  }

  scale <- if (is.null(value$scale)) "linear" else value$scale
  if (!identical(scale, "linear") && !identical(scale, "log")) stop('`scale` must be "linear" or "log"')
  cell <- .stepdeck_first(frames, function(f) if (is.numeric(f)) !is.na(f) & !is.finite(f) else !is.na(f))
  if (!is.null(cell)) stop("cells must be finite numbers, or NA, None or NaN for no data ", .stepdeck_where(cell, lapse))
  if (scale == "log") {
    cell <- .stepdeck_first(frames, function(f) !is.na(f) & f <= 0)
    if (!is.null(cell)) stop("a log scale needs every value above 0 ", .stepdeck_where(cell, lapse))
  }
  data <- unlist(lapply(frames, function(f) f[!is.na(f)]))
  if (length(data) == 0) stop("the grid has no data")
  lo <- if (is.null(value$min)) min(data) else value$min
  hi <- if (is.null(value$max)) max(data) else value$max
  finite <- function(x) is.numeric(x) && length(x) == 1 && is.finite(x)
  if (!finite(lo) || !finite(hi)) stop("`min` and `max` must be finite numbers")
  if (!(lo < hi)) stop("`min` must be less than `max` (are all the values equal? then give `value` with `min` and `max`)")
  if (scale == "log" && !(lo > 0)) stop("a log scale needs `min` above 0")
  if (!is.finite(if (scale == "log") hi / lo else hi - lo)) stop("`min` and `max` are too far apart to compute levels")
  rest <- value[setdiff(names(value), c("scale", "min", "max"))]
  value <- c(list(scale = scale, min = lo, max = hi), rest)

  share <- if (scale == "log") function(v) log(v / lo) / log(hi / lo) else function(v) (v - lo) / (hi - lo)
  # a value past the range is written at its nearer end; the matrix first keeps its dim
  levels <- lapply(frames, function(f) pmin(pmax(floor(share(f) * 255 + 0.5), 0), 255))
  list(value = value, levels = levels)
}

# An 8-bit greyscale PNG of `g` (levels, NA for no data), with alpha only when some cell has no data. png::writePNG
# takes values from 0 to 1 and rounds value * 255 to the nearest byte, so level / 255 is written as the level itself.
.stepdeck_png <- function(g, file) {
  grey <- ifelse(is.na(g), 0, g) / 255
  if (anyNA(g)) png::writePNG(array(c(grey, ifelse(is.na(g), 0, 1)), c(dim(g), 2)), file)
  else png::writePNG(grey, file)
}
