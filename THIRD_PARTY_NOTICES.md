# Third-party notices

stepdeck is MIT licensed (see `LICENSE`). It vendors the libraries below under
`vendor/`; each keeps its own license file next to the code.

| Library | Version | License | Files | License file |
| --- | --- | --- | --- | --- |
| reveal.js | 6.0.2 (copyright 2011-2026) | MIT | `vendor/reveal/reveal.js`, `reveal.css`, `reset.css`, `plugin/notes.js` | `vendor/reveal/LICENSE` |
| marked (inside the reveal notes plugin) | not stated in the file | MIT (copyright 2018+ MarkedJS; 2011-2018 Christopher Jeffrey and the marked contributors) | bundled into `vendor/reveal/plugin/notes.js` | `vendor/marked/LICENSE` (the same MIT text) |
| d3 | 7.9.0 | ISC | `vendor/d3/d3.min.js` | `vendor/d3/LICENSE` |
| marked | 18.2.1 | MIT (copyright 2018+ MarkedJS; 2011-2018 Christopher Jeffrey) | `vendor/marked/marked.esm.js` | `vendor/marked/LICENSE` |

`marked` is the unmodified `lib/marked.esm.js` of the npm package, used by the
`markdown` component. The reveal notes plugin (`vendor/reveal/plugin/notes.js`)
bundles its own minified copy of marked, which renders the speaker notes; that
copy is also MIT licensed (Copyright (c) 2018+ MarkedJS, Copyright (c) 2011-2018
Christopher Jeffrey and the marked contributors), under the license text in
`vendor/marked/LICENSE`. The development-only dependency `ajv` is installed from
npm and is not copied into decks.

## d3 sub-notices

`d3.min.js` is the d3 UMD bundle. It is built from many modules, and the bundle
itself carries only the single header line `Copyright 2010-2023 Mike Bostock`.
The modules below carry additional notices in their upstream repositories; they
are reproduced here because the bundle's minification strips them.

### ColorBrewer (d3-scale-chromatic)

The ColorBrewer color schemes in `d3.schemeBrBG`, `d3.interpolateBlues` and
related schemes are:

> Apache-Style Software License for ColorBrewer software and ColorBrewer Color Schemes
>
> Copyright (c) 2002 Cynthia Brewer, Mark Harrower, and The Pennsylvania State University.
>
> Licensed under the Apache License, Version 2.0 (the "License"); you may not
> use this file except in compliance with the License. You may obtain a copy of
> the License at http://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software
> distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
> WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
> License for the specific language governing permissions and limitations under
> the License.

### d3-ease

d3-ease is BSD-3-Clause and includes Robert Penner's easing equations, which
are also BSD-3-Clause:

> Copyright 2010-2021 Mike Bostock
> All rights reserved.
>
> TERMS OF USE - EASING EQUATIONS
>
> Open source under the BSD License.
>
> Copyright 2001 Robert Penner
> All rights reserved.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
>
> - Redistributions of source code must retain the above copyright notice, this
>   list of conditions and the following disclaimer.
> - Redistributions in binary form must reproduce the above copyright notice,
>   this list of conditions and the following disclaimer in the documentation
>   and/or other materials provided with the distribution.
> - Neither the name of the author nor the names of contributors may be used to
>   endorse or promote products derived from this software without specific
>   prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
> AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
> DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
> FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
> DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
> SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
> CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
> OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
> OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

### d3-geo

d3-geo (v3, bundled in d3 7.9) is ISC licensed (Copyright 2010-2022 Mike
Bostock), under the same ISC terms as `vendor/d3/LICENSE`. It includes code
derived from GeographicLib, which is MIT licensed:

> Copyright (c) 2008-2012, Charles Karney
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

### Delaunator (d3-delaunay)

d3-delaunay bundles Delaunator, which is ISC licensed:

> ISC License
>
> Copyright (c) Mapbox
>
> Permission to use, copy, modify, and/or distribute this software for any
> purpose with or without fee is hereby granted, provided that the above
> copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
> REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
> AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
> INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
> LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
> OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
> PERFORMANCE OF THIS SOFTWARE.

### internmap (d3-array)

d3-array bundles internmap (`InternMap`, `InternSet`), which is ISC licensed,
Copyright Mike Bostock, under the same ISC terms as `vendor/d3/LICENSE`.

## Fonts

The `academic-light` theme vendors two font families, and the `modern` theme two more
(Geist and Geist Mono, below). All are licensed under the SIL Open Font License,
Version 1.1. The `academic-light` woff2 files are Fontsource's subsetted,
format-converted builds (latin and latin-ext subsets only), taken from the npm
packages `@fontsource/source-sans-3` 5.3.0 and `@fontsource/ibm-plex-mono` 5.3.0
(versions read from each package's `package.json`). Each family's license ships
next to its files as `OFL.txt`: the upstream copyright line, then the OFL 1.1 text.

| Family | Weights | Files | License file |
| --- | --- | --- | --- |
| Source Sans 3 | 400, 400 italic, 600, 700 | `themes/academic-light/fonts/source-sans-3/*.woff2` | `themes/academic-light/fonts/source-sans-3/OFL.txt` |
| IBM Plex Mono | 400, 500 | `themes/academic-light/fonts/ibm-plex-mono/*.woff2` | `themes/academic-light/fonts/ibm-plex-mono/OFL.txt` |

- **Source Sans 3**: Copyright 2010-2020 Adobe (http://www.adobe.com/), with
  Reserved Font Name 'Source'. Upstream: https://github.com/adobe-fonts/source-sans
- **IBM Plex Mono**: Copyright © 2017 IBM Corp. with Reserved Font Name 'Plex'.
  Upstream: https://github.com/IBM/plex

The `modern` theme vendors Geist and Geist Mono, unmodified (only the file names were
simplified), from the official `vercel/geist-font` release v1.9.2
(https://github.com/vercel/geist-font/releases/download/v1.9.2/geist-font-v1.9.2.zip, font
version 1.900), files `Geist/webfonts/Geist[wght].woff2`,
`Geist/webfonts/Geist-Italic[wght].woff2` and `GeistMono/webfonts/GeistMono[wght].woff2`.
Each is one variable face (weights 100-900) with the Latin and Latin Extended glyphs.
Each family's license ships next to its files as `OFL.txt`, copied verbatim from the
release.

| Family | Weights | Files | License file |
| --- | --- | --- | --- |
| Geist | 100-900 (variable), upright and italic | `themes/modern/fonts/geist/*.woff2` | `themes/modern/fonts/geist/OFL.txt` |
| Geist Mono | 100-900 (variable) | `themes/modern/fonts/geist-mono/*.woff2` | `themes/modern/fonts/geist-mono/OFL.txt` |

- **Geist** and **Geist Mono** (upstream: https://github.com/vercel/geist-font):
  Copyright 2026 The Geist Project Authors (https://github.com/vercel/geist-font).
  No Reserved Font Name is declared.

The OFL permits bundling and redistribution with software, provided the copyright
notice and license travel with the fonts; the fonts may not be sold by themselves.

## Palettes

The palettes in `themes/academic-light/palettes.json` (the `modern` theme's `viridis` and
`blue-red` are the same palettes; its `modern` categorical palette is stepdeck's own):

- `okabe-ito-dark` is derived from the Okabe-Ito palette: Okabe, M. and Ito, K.
  (2008). *Color Universal Design (CUD): how to make figures and presentations that
  are friendly to colorblind people.* https://jfly.uni-koeln.de/color/ stepdeck
  darkens the colors for contrast on white.
- `viridis` uses stops of the viridis colormap by Stéfan van der Walt and Nathaniel
  Smith, released under CC0 (public domain dedication).
- `blue-red` is ColorBrewer RdBu (5 classes), under the ColorBrewer Apache-style
  license reproduced above.

## Data

All data in this repository (the example decks, the gallery and the test fixtures) is synthetic, made up for
the examples and tests; it carries no third-party license.
