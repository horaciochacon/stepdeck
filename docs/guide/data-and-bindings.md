# Data and bindings

This page shows how to put data files in a deck and bind their values into component props. It also covers how CSV columns get their types, how numbers are formatted in each deck language, and what `validate` checks. It is for people who write decks by hand. If an agent builds your deck, it follows the same rules from [`skill/references/components.md`](../../skill/references/components.md).

Exact error messages are collected in [Troubleshooting](../troubleshooting.md). Every rule name used below is listed in [Rules](../reference/rules.md).

## Put data files in the deck

A deck reads data from files inside its own folder, usually under `data/`. The starter deck made by `new` has two:

```
my-talk/
  deck.js
  slides/
  data/
    make-data.mjs   # the script that writes the two files below
    series.csv
    summary.json
```

**File types.** The data loader reads three extensions. Any other extension is refused.

| Extension | Parsed as | Result |
| --- | --- | --- |
| `.json` | JSON | the parsed value |
| `.geojson` | JSON | the parsed value |
| `.csv` | CSV (RFC 4180: quoted fields, CRLF and a BOM are handled) | an array of row objects, one per record after the header (blank lines are skipped) |

**Paths.** Write every path relative to the deck root, for example `data/summary.json`. The loader refuses a path that:
- starts with `/`;
- contains a backslash (`\`);
- starts with a scheme, such as `https:`;
- contains `%`;
- contains a `..` segment.

`./` segments and doubled slashes are dropped, so `./data//x.json` is the same file as `data/x.json`.

**Characters.** Use only letters, digits, `_`, `-`, `.` and `/` in data file names. `validate` reports a binding path with any other character, such as a space or an accented letter, as `binding-file` (not found), even when the file exists.

**Case.** Write the path in the same case as the file on disk. macOS forgives `data/Summary.json` for `data/summary.json`, but most web servers do not. `validate` compares paths with the real file listing and reports a mismatch as `path-case`.

**No remote data.** A talk must run offline, so data cannot come from a URL. The loader refuses any path with a scheme. `validate` reports any `http://`, `https://` or `//host` in a prop as `remote-url`, and `check` blocks every request to another origin. Download the file into the deck instead.

**Shared and cached.** Each file is read once and the parsed result is shared by every element that uses it. A CSV is cached per path and per set of declared column types.

## Generate data with a script

Every number on a slide should come from a data file, through a binding or as a chart column, never typed by hand. Keep the script that makes the data in the deck, so anyone can rebuild it. The starter deck's `data/make-data.mjs` writes both its files:

```js
import { writeFileSync } from "node:fs";

const round1 = (v) => Math.round(v * 10) / 10;
const rows = [];
for (let year = 2015; year <= 2024; year++) {
  const t = year - 2015;
  rows.push({ year, group: "Group B", value: round1(year <= 2020 ? 22 + 0.9 * t : 26.5 + 2.7 * (year - 2020)) });
  rows.push({ year, group: "Group A", value: round1(24 + 1.1 * t) });
}

const here = new URL("./", import.meta.url);
const csv = ["year,group,value", ...rows.map((r) => `${r.year},${r.group},${r.value}`)];
writeFileSync(new URL("series.csv", here), `${csv.join("\n")}\n`);
const latest = (group) => rows.find((r) => r.group === group && r.year === 2024).value;
writeFileSync(new URL("summary.json", here), `${JSON.stringify({ latest_a: latest("Group A"), latest_b: latest("Group B") }, null, 2)}\n`);
```

Run it from the deck folder:

```sh
node data/make-data.mjs
```

The pattern:
- **One script, checked in.** It writes paths relative to its own file (`new URL("./", import.meta.url)`), so it works from any working folder.
- **CSV for tables a chart reads**, one row per point, with a header row.
- **JSON for single figures you bind**, with short, stable keys. A binding cannot declare CSV column types, so JSON is the safer source for bound numbers.
- **Deterministic output.** The same input gives the same files, so a rerun changes nothing unless the data changed.
- **A source line.** A slide with a `chart.*` or `big-number` element needs an element with `role: "source"`, or `validate` reports `figure-source`.

## How CSV columns get their types

A chart names a CSV in its `data` prop and its columns in `x`, `y`, `series` and so on. The loader turns each cell into a string, a number or `null`:

1. **A declared type wins.** `chart.line`, `chart.bar` and `chart.points` take a `types` prop that maps a column to `"string"`, `"number"` or `"date"`. A declared number column accepts any decimal or exponent form, including a leading zero (`"080101"` becomes `80101`). A cell that does not parse is an error naming the column and the row.
2. **Undeclared columns are guessed.** A column becomes numbers only when every non-empty cell is a plain decimal: an optional minus, no leading zero, optional decimals, no exponent and no thousands separator. Otherwise the whole column stays strings. So a code such as `080101` stays the string `"080101"`.
3. **Dates are only dates when declared.** A `date` column keeps each value as the original ISO 8601 string (`2024-01-02`, or with a time and offset). The loader checks that it is a real calendar day, so `2024-02-31` is an error. An undeclared column of dates stays strings.
4. **Empty cells** become `null` in number and date columns and `""` in string columns.
5. **Row length.** A row with more cells than the header is an error. A shorter row is padded with empty cells.

This is the starter deck's line chart. Every column of `data/series.csv` is guessed, and `year` and `value` become numbers:

```js
{ id: "chart", region: "main", type: "chart.line",
  props: { data: "data/series.csv", x: "year", y: "value", series: "group",
           series_shown: ["Group A"],
           axes: { x: "Year", y: "Indicator per 1,000" },
           format: { x: "d", y: ",.0f" } } },
```

To override a guess, add `types` to the chart's props. For example, `types: { code: "string" }` is the default for a column of codes such as `080101`, and `types: { code: "number" }` reads the same column as numbers (`80101`). Declare `"date"` only for full ISO dates such as `2024-01-02`: a bare year like `2015` is not a valid date.

## Bind a value into a prop

Any string prop, at any depth inside objects and arrays, can take a value from a data file:

```
{{path#/json/pointer | format}}
```

- **`path`** is the data file, relative to the deck root, under the rules above.
- **`#/json/pointer`** is an [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) JSON pointer into the parsed file. The `#` is required. `#` with nothing after it is the whole file. `#/rows/0/value` is the `value` of the first item of `rows`. In a CSV, `#/0/value` is the `value` cell of the first data row. Array indexes must be written without leading zeros. Inside a key, write `~1` for `/` and `~0` for `~`.
- **`| format`** is optional: a d3-format specifier, described in [Format numbers](#format-numbers-for-the-deck-language).

Spaces around the path, the pointer and the format are ignored.

**What a binding resolves to** depends on whether it is the whole string and whether it has a format. With the starter deck's `data/summary.json` (`{ "latest_a": 33.9, "latest_b": 37.3 }`) and `lang: "en"`:

| Prop value | Resolves to |
| --- | --- |
| `"{{data/summary.json#/latest_b}}"` | `37.3`, the raw number |
| `"{{data/summary.json#}}"` | the whole object `{ latest_a: 33.9, latest_b: 37.3 }` |
| `"{{data/summary.json#/latest_b \| ,.1f}}"` | `"37.3"`, a string |
| `"Group B reached {{data/summary.json#/latest_b \| ,.1f}} per 1,000"` | `"Group B reached 37.3 per 1,000"` |
| `" {{data/summary.json#/latest_a}}"` (leading space) | `" 33.9"`, a string: the binding is embedded, not the whole string |
| `"{{data/summary.json}}"` (no `#`) | left as the literal text `{{data/summary.json}}` |

The rules behind the table:
- **Whole string, no format: the raw value.** It can be a number, string, boolean, `null`, array or object. Use this to pass a number to a prop that needs one. In a prop that needs a string, such as `text`, a raw number is refused (`prop-invalid`): add a format or put the binding inside text.
- **With a format, or embedded in text: a string.** A format needs a number. Formatting a string, `null`, an array or an object is an error.
- **Embedded without a format:** numbers, strings and booleans are written as text. `null`, arrays and objects cannot be embedded in text and are an error.
- **No `#`, no binding.** A `{{...}}` without `#` is not a binding and stays as you wrote it. `validate` does not flag it, so check the slide if braces show on screen.

Bindings are resolved before the component sees its props, at every step. A binding written in a step's `set` works the same as one in the element's initial props.

### Bind a big number

`big-number` needs a numeric `value` and formats it itself, so it can count up from the number. Bind `value` with no format, and put the format in the separate `format` prop. This is the starter deck's version:

```js
{ id: "latest", region: "notes", type: "big-number", from: "latest",
  props: { value: "{{data/summary.json#/latest_b}}", format: ",.1f", label: "Group B in 2024, per 1,000" } },
```

A formatted binding in `value`, such as `"{{data/summary.json#/latest_b | ,.1f}}"`, resolves to a string. Its schema refuses that, so `validate` reports `prop-invalid`, and on the slide the element shows an error telling you to move the format to `format`. See the [big-number reference](../reference/components/big-number.md).

## Format numbers for the deck language

A format is a [d3-format](https://d3js.org/d3-format) specifier, such as `,.0f` (thousands separators, no decimals), `.1%` (a percentage with one decimal) or `$,.2f` (currency). The same specifiers appear in binding formats, the `format` prop of `big-number` and the `format` prop of the charts.

The deck's `lang` (from `deck.js`, or `?lang=` in the URL) only changes the separators and the currency symbol:

| `lang` | Decimal | Thousands | Currency | `,.1f` of 12345.6 | `$,.2f` of -12345.6 |
| --- | --- | --- | --- | --- | --- |
| `en` | `.` | `,` | `$` before | `12,345.6` | `−$12,345.60` |
| `es` | `,` | `.` | ` €` after | `12.345,6` | `−12.345,60 €` |

- Any other `lang` uses the `en` separators.
- Negative numbers use the true minus sign, U+2212 (`−`), not a hyphen, in every language.
- An invalid specifier is an error.

## Name a palette color in Markdown

To refer to a color the audience can see, such as "the blue line", write `{{color:<role>}}` in a `markdown` element. It is replaced by the name of the color that the role points to, in the deck language:

```js
{ id: "note", type: "markdown",
  props: { md: "The {{color:accent}} line is Group B." } }
```

With either built-in theme, `accent` is the blue of its categorical palette (`#1d4ed8` in `modern`, the default; `#0072b2` in `academic-light`), so this reads "The blue line is Group B." in `en` and uses "azul" in `es`.

- The role is looked up in the deck's categorical palette, then the sequential, then the diverging one. The first palette that defines the role wins.
- In both built-in themes, `accent` and `alert` come from the categorical palette (`alert` is rose, "rosa", in `modern` and vermillion in `academic-light`), `low` and `high` always come from the sequential palette, and `mid` comes from the diverging palette. The diverging palette's own `low` and `high` cannot be reached through `{{color:...}}`.
- An unknown role is an element error that lists the known roles.
- `{{color:...}}` works only in `markdown`. In `text` it stays as written.
- Never put hex colors in props: `validate` reports them as `hex-color`.

Theme palettes are covered in [Layouts and themes](layouts-and-themes.md).

## What validate checks

`node cli/index.js validate <deck>` folds every step of every slide and checks every string prop of every element. It reads the files on disk and needs no browser. For data it reports these rules:

| Rule | What triggers it |
| --- | --- |
| `binding-file` | A binding's file does not exist in the deck, or it does not parse. A path with any character other than letters, digits, `_`, `-`, `.` and `/` counts as not found. |
| `binding-pointer` | The pointer is not in the file, or it is malformed (not empty and not starting with `/`, or a `~` not followed by `0` or `1`). When the key is missing, the problem lists the keys that are there and suggests a close one. |
| `binding-format` | The format is not a valid d3-format specifier; a format is applied to a value that is not a number; or an embedded binding without a format points at `null`, an array or an object. |
| `path-case` | A binding path or a file path differs in case from the file on disk. |
| `file-missing` | A prop whose whole value looks like a deck file names a file that does not exist. A deck file is a relative path that does not start with `.` or `/`, has no `..`, uses only letters, digits, `_`, `-`, `.` and `/`, and ends in a data, image or media extension (`.json`, `.geojson`, `.csv`, `.png`, `.jpg`, `.svg`, `.webp`, `.mp4`, `.mp3` and others). |
| `data-invalid` | An element's `data` names a CSV that exists but does not parse with its declared `types`. |
| `missing-column` | `x`, `y`, `series`, `interval.lower` or `interval.upper` names a column that is not in the CSV header. The fix suggests a close column name. |
| `remote-url` | A prop contains an `http://`, `https://` or `//host` URL. |

Here is an excerpt (4 of 8 problem lines) from a run on a scratch copy of the starter deck with a slide broken on purpose:

```text
closing/t3 · path-case · text: {{data/Summary.json#/latest_a}} vs on disk: data/summary.json · write the binding path as data/summary.json
closing/big · binding-pointer · value: #/latest_c not in data/summary.json vs keys there: latest_a, latest_b · use #/latest_a
closing/t2 · binding-format · text: # is an object vs a number or string inside text · point at a number or string, or make text exactly the binding
closing/chart · missing-column · x = 'Year' vs columns of data/series.csv: year, group, value · set x to 'year'
```

Each line reads `slide/element/step · rule · measured vs limit · fix`. The step is left out here because the closing slide has no steps; on a slide with steps you will see, for example, `closing/t3/a`. When a binding fails, `validate` skips the element's schema check, so fix bindings first. [Checking a deck](checking-a-deck.md) explains the full output and the other checks.

## Use images and other asset files

Images and media follow the same path rules as data. Put them in the deck, usually under `assets/`, and write a deck-relative path. The `image` component resolves `src` through `ctx.assetUrl`, which applies the data path rules (relative, no `%`, no `..`, no scheme) and accepts any extension. This is the cover of the example kit deck (`examples/kit/slides/cover.js`):

```js
{ id: "figure", region: "figure", type: "image",
  props: { src: "assets/cover.svg", alt: "A chat prompt and an agent's reply above a bar chart whose bars get shorter" } },
```

- `validate` checks that the file exists in that exact case (`file-missing`, `path-case`) and refuses remote URLs (`remote-url`). It checks only paths written in the deck-file form described under [What validate checks](#what-validate-checks), so a missing `./assets/x.png` or `assets/my image.png` is not caught: write `assets/x.png`.
- A file that is missing or does not decode as an image is an element error on the slide.
- A custom component that loads its own files should resolve them with `ctx.assetUrl(path)` and read data with `ctx.data(path)`. See [Custom components](custom-components.md) and the [component contract](../reference/component-contract.md).

## See also

- [Components reference](../reference/components/index.md): which props take data, columns and formats.
- [Rules](../reference/rules.md): every `validate` and `check` rule.
- [Troubleshooting](../troubleshooting.md): exact error messages and what to do about them.
- [`skill/references/components.md`](../../skill/references/components.md): the same rules, written for agents.
