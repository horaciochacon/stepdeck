// Shared d3 accessor: one module that works in Node and in the browser without a bundler.
//
// vendor/d3/d3.min.js is the UMD build of d3 v7.9.0. Depending on where it is evaluated it
// behaves differently, and this helper covers all three cases with a single static import:
//   - browser ES module, or Node ESM (package "type": "module"): `exports` is undefined, so the
//     bundle assigns the library to `globalThis.d3`; the namespace we import is empty.
//   - The file evaluated as CommonJS (e.g. a package.json scoped to vendor/d3 with
//     "type": "commonjs"): the bundle sets `module.exports`, which arrives as the namespace's
//     `default` and `globalThis.d3` stays unset.
//   - d3 already loaded by a classic <script>: `globalThis.d3` exists and the bundle reuses it.
// Components and core modules import { d3 } from here instead of touching the vendor file.
import * as namespace from "../vendor/d3/d3.min.js";

export const d3 = globalThis.d3 ?? namespace.default ?? namespace;
export default d3;
