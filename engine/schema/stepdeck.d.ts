// stepdeck: the component contract and the deck/slide spec, for editors and agents.
// Spec: docs/design/2026-11-18-engine-design.md §6 and §9 (amended after M0; see docs/design/m0-findings.md).
// These types describe the runtime, the specs (schema/*.json) and the CLI's machine output
// (--json); nothing imports them at run time.

// ---------------------------------------------------------------------------------------------
// JSON values (props are JSON only: no functions)

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONValue[] | { [key: string]: JSONValue };
export type Props = { [key: string]: JSONValue };

/** A box on the 1920×1080 canvas, in canvas pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------------------------
// Deck and slide specs (deck.js, slides/<id>.js: importable in plain Node)

/** A step reference: the step's id, or its index (0-based). Prefer ids. */
export type StepRef = string | number;

export type MotionName = "fade" | "rise" | "wipe" | "pop" | "draw" | "none";

/** A motion name, or an object that adds a delay and a duration (milliseconds, 0 to 5000). */
export type EnterExit = MotionName | { motion: MotionName; delay?: number; duration?: number };

export interface DeckSpec {
  title: string;
  /** Deck language; engine strings and number formats follow it. Built in: "en", "es". */
  lang?: string;
  /** Theme folder name, e.g. "academic-light". */
  theme?: string;
  /** Palette name; must belong to the theme's validated set. */
  palette?: string;
  /** "Section · n" footer. */
  sections?: boolean;
  /** Deck components, in components/<name>/ (index.js + schema.json). Names may contain dots. */
  components?: string[];
  /** Slide ids, in order; each is slides/<id>.js. */
  slides: string[];
}

export interface Advance {
  /** The prop to drive. */
  prop: string;
  /** One value per step from `start`; the last value holds afterwards. */
  values: JSONValue[];
  /** First step it applies to (default 0). */
  start?: StepRef;
}

export interface ElementSpec {
  id: string;
  /** "text", "markdown" or a component name ("chart.line", "terminal", "my.story"). */
  type: string;
  props?: Props;
  /** Layout region; default "main". */
  region?: string;
  /** Float anywhere on the canvas instead of flowing in a region. */
  box?: Box;
  /**
   * How the element arrives on an animating step: default the theme's --sd-enter, or the component's own build
   * when its schema declares "x-enter": "own". `delay` (entrances only) adds to its stagger slot.
   */
  enter?: EnterExit;
  /**
   * How the element leaves on an animating step: default "fade". A collapsing element always leaves at once.
   * Exits start at once: a `delay` here does nothing (validate: exit-delay-ignored).
   */
  exit?: EnterExit;
  /** Hidden elements keep their space unless collapse is true. */
  collapse?: boolean;
  /** While hidden, show a placeholder in the element's space: true for a plain one, a string for a labelled one, false for none. Not with collapse. */
  ghost?: boolean | string;
  /** Visible from this step on. */
  from?: StepRef;
  /** Visible only at these steps. */
  at?: StepRef[];
  advance?: Advance;
}

export interface Transition {
  /** Gap between the elements that enter on the step and between the items of a build, ms (0 to 1000); replaces --sd-stagger. */
  stagger?: number;
  /** Duration, ms (0 to 5000); replaces the theme's durations at this step. 0 snaps the step. */
  duration?: number;
}

/** One step: a patch folded into every later step (except `only`). */
export interface StepSpec {
  id?: string;
  /** RFC 7396 merge patch per element id. */
  set?: { [elementId: string]: Props | null };
  /** Replace an element's props wholesale. */
  replace?: { [elementId: string]: Props };
  show?: string[];
  hide?: string[];
  /** Like set, at this step only (not folded into later steps). */
  only?: { [elementId: string]: Props };
  notes?: string;
  transition?: Transition;
}

export interface SlideSpec {
  id: string;
  layout?: string;
  /**
   * The slide's section: shown as the kicker above the title, an element with the reserved id "kicker" (type text,
   * region title, hook .sd-kicker). A layout without a title region drops it (validate: kicker-no-region).
   */
  section?: string;
  /**
   * Sugar for an element with the reserved id "title" (type text, region title, props { text, accent: true }).
   * `*phrase*` is an accent phrase (hook .sd-accent); `\*` is a literal asterisk.
   */
  title?: string;
  /**
   * A message line under the title: sugar for an element with the reserved id "lede" (type text, region title,
   * props { text, role: "lede" }), placed right after the title. A step changes it with `set: { lede: { text } }`.
   * An element of your own with id "lede" replaces the sugar. On a cover layout use the subtitle region instead
   * (validate: lede-on-cover).
   */
  lede?: string;
  elements: ElementSpec[];
  steps?: StepSpec[];
  /** Scoped CSS, prefixed with the slide id. `:scope`/`&` target the canvas. */
  style?: string;
  /** Layout grid variable overrides, e.g. { "--notes-width": "700px" }. */
  regions?: { [cssVariable: string]: string };
  /** Speaker notes for steps that have none. */
  notes?: string;
  /** Planned speaking time, in seconds. */
  seconds?: number;
}

// ---------------------------------------------------------------------------------------------
// Component schemas, layouts and themes (files read by validate and the catalog, never executed)

/** How a change of a prop animates (`x-transition` on every prop of a component schema.json). */
export type XTransition = "tween" | "draw" | "fade" | "snap";

/** One prop of components/<name>/schema.json (JSON Schema 2020-12 plus x-transition). */
export interface PropSchema {
  description: string;
  examples: JSONValue[];
  "x-transition": XTransition;
  default?: JSONValue;
  [jsonSchemaKeyword: string]: unknown;
}

/** components/<name>/schema.json. The first sentence of `description` is the catalog summary. */
export interface ComponentSchema {
  $schema?: string;
  title: string;
  description: string;
  type: "object";
  additionalProperties?: boolean;
  required?: string[];
  properties: { [prop: string]: PropSchema };
}

/** layouts/<name>/schema.json (schema/layout.schema.json). */
export interface LayoutDescriptor {
  name: string;
  description: string;
  regions: { name: string; description: string }[];
  /** Grid variables a slide may override in `regions`. */
  variables: { name: string; default: string; description: string }[];
  /**
   * Styling hooks: a declared region's name -> a region hook (REGION_HOOKS); core adds `sd-<hook>` to that region and
   * its element wrappers. title, kicker and accent are core's own and cannot be mapped.
   */
  hooks?: { [region: string]: "subtitle" | "meta" | "statement" };
  /**
   * Layout kind, set as `data-kind` on the canvas (default "content"). A "cover" title takes the cover size, and the
   * smaller cover-figure size while a region named `figure` holds an element.
   */
  kind?: "content" | "cover";
}

/** themes/<name>/palettes.json. */
export interface ThemePalettes {
  default: { categorical?: string; sequential?: string; diverging?: string };
  palettes: {
    [name: string]: {
      kind: "categorical" | "sequential" | "diverging";
      description?: string;
      source?: string;
      colors: { id: string; value: string; names: { [lang: string]: string } }[];
      /** Role -> color id, e.g. { accent: "blue" }. */
      roles?: { [role: string]: string };
    };
  };
}

// ---------------------------------------------------------------------------------------------
// Component contract (spec §6.3)

export interface ComponentModule<P extends Props = Props> {
  /**
   * Build DOM inside `el` with the step-0 resolved props and return the instance (or a promise of it).
   * Hidden elements are mounted too. Mounting applies no visibility and is not a state.
   */
  mount(el: HTMLElement, props: P, ctx: ComponentContext): ComponentInstance<P> | Promise<ComponentInstance<P>>;
}

export interface ComponentInstance<P extends Props = Props> {
  /**
   * Render the given state. Idempotent: correct for any state reached in any order, leaving no
   * animation residue whether it finished or was aborted. Resolves when the state is final.
   * Never called concurrently for one instance; skipped when resolved props and visibility are unchanged.
   */
  update(props: P, info: UpdateInfo<P>): void | Promise<void>;
  /** Canvas box of a named part (for mark/callout), or null. */
  anchor?(ref: string): Box | null;
  /** The slide was left: stop media and timers. */
  pause?(): void;
  /** Teardown. */
  destroy?(): void;
}

export interface UpdateInfo<P extends Props = Props> {
  /** Previous resolved props; null on the first update after mount. */
  prev: P | null;
  /** Top-level keys that differ from prev (added and removed included); all keys on the first update. */
  changed: string[];
  /** The element just became visible (on the first update: it is visible). */
  entered: boolean;
  /** Step id (the index when the step has no id). For logging only: never branch on it. */
  step: string | number;
  /** Previous applied step; null on the first update. */
  prevStep: string | number | null;
  /** True only on a forward move by exactly one step, outside capture and preview frames, with motion on. */
  animate: boolean;
  /** Aborted when a newer navigation supersedes this one: snap to the end state. Shared by the step's elements. */
  signal: AbortSignal;
  transition?: Transition;
  /**
   * Set only for a component whose schema.json declares `"x-enter": "own"`, in the update where its element
   * becomes visible on an animating step (the engine has already held it to its stagger slot); null otherwise.
   */
  entrance: Entrance | null;
}

/**
 * How a component that owns its entrance enters: "draw" builds from empty to this state (the box stays
 * still); "none" renders this state at once (the box moves instead, or nothing does). Write the start state
 * synchronously at the top of update(), before any await.
 */
export interface Entrance {
  motion: "draw" | "none";
  /**
   * The element's own `enter.duration` (ms; 0 on a step whose duration is 0). Undefined: time the build with
   * ctx.motion.timing(info), as for any other motion of the step.
   */
  duration: number | undefined;
}

export interface AnimateOptions {
  /** ms; default 400. <= 0 jumps to the end state. */
  duration?: number;
  signal?: AbortSignal;
}

/**
 * Abort-aware helpers. Each resolves at its end state, also when aborted or with duration <= 0.
 * Each rejects only when the caller's own callback or element throws (the element then fails).
 */
export interface AnimateHelpers {
  fadeIn(el: Element, opts?: AnimateOptions): Promise<void>;
  /** Wipes in with a clip-path. */
  reveal(el: Element, opts?: AnimateOptions): Promise<void>;
  /** Draws an SVG path along its length. */
  drawPath(path: SVGGeometryElement, opts?: AnimateOptions): Promise<void>;
  /** Numbers only. onValue(from) runs first, onValue(to) always runs last. */
  tween(from: number, to: number, onValue: (value: number) => void, opts?: AnimateOptions & { ease?: (t: number) => number }): Promise<void>;
  /** Starts fn for item i after i * stagger ms (default 60); on abort, every pending item starts at once. */
  stagger<T>(
    items: readonly T[],
    fn: (item: T, index: number, opts: AnimateOptions) => void | Promise<void>,
    opts?: AnimateOptions & { stagger?: number },
  ): Promise<void>;
}

export interface MotionOptions {
  /** ms; default the theme's --sd-duration. <= 0 jumps to the end state. */
  duration?: number;
  signal?: AbortSignal;
  /** Default the theme's --sd-easing. */
  ease?: (t: number) => number;
  /** Travel in px for `rise`; default the theme's --sd-motion-distance. */
  distance?: number;
}

export interface MotionTiming {
  duration: number;
  ease: (t: number) => number;
  /** 0 when the duration is 0. */
  stagger: number;
  signal?: AbortSignal;
}

/**
 * The named motions with the theme's defaults (an option passed as undefined keeps the default). They write
 * only opacity, transform and clip-path, and resolve (never reject) on abort or a zero duration.
 */
export interface MotionHelpers {
  /** Plays `name` to the shown state, then restores the node's inline opacity, transform and clip-path. */
  in(node: Element, name: MotionName, opts?: MotionOptions): Promise<void>;
  /** Plays `name` to the hidden state and leaves it there; resolves with the inline values it replaced. */
  out(node: Element, name: MotionName, opts?: MotionOptions): Promise<{ opacity?: string; transform?: string; clipPath?: string }>;
  /** Duration, ease and stagger from the theme tokens; the step's `transition` overrides them. */
  timing(info: Partial<UpdateInfo>, opts?: { factor?: number; fast?: boolean }): MotionTiming;
  names: readonly MotionName[];
}

export interface Palette {
  name: string;
  kind: "categorical" | "sequential" | "diverging";
  /** Color values, in order. */
  colors: string[];
  /** Color names in the deck language (for {{color:…}}). */
  names: string[];
  /** Role -> color value, e.g. { accent: "#…" }. */
  roles: { [role: string]: string };
}

export type CsvType = "string" | "number" | "date";

/** Handle for a component mounted with ctx.mount inside another one. */
export interface ChildHandle<P extends Props = Props> {
  instance: ComponentInstance<P>;
  /**
   * Resolves the child's bindings and calls its update with the parent's info (animate, signal, entered,
   * step, transition) and the child's own prev/changed. Never skips a no-op; that is the parent's call.
   * Rejects after destroy().
   */
  update(props: P, info: Partial<UpdateInfo>): Promise<void>;
  pause(): void;
  /** Idempotent; removes the child from its parent, so it can be swapped. */
  destroy(): void;
}

/** A value, or an accessor `(d, i, nodes) => value` called per node, as d3 does. */
export type PerNode<T> = T | ((d: any, i: number, nodes: any) => T);

export interface ChartMargin {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The plot frame `ctx.chart.frame` measures: canvas pixels, margins rounded, `pw` and `ph` at least 1. */
export interface ChartFrame {
  w: number;
  h: number;
  /** `--sd-font-size-label` (28 when the theme has none). */
  font: number;
  /** 0.6 x font: a character width for sizing margins from character counts. */
  charW: number;
  margin: ChartMargin;
  pw: number;
  ph: number;
}

export interface CanvasLine {
  /** Plot pixels. A line with fewer than 2 points is skipped. */
  points: Array<[number, number]>;
  color: string;
  alpha?: number;
  width?: number;
}

/**
 * The chart building blocks every component gets as `ctx.chart` (one frozen object). `Selection` is a d3
 * selection. See the component contract for each one's behavior.
 */
export interface ChartKit {
  /** Loads `props.data` (a CSV) and checks every column the props name: `columns` is `[prop, column, optional?]`. */
  loadTable(props: Props, ctx: ComponentContext, name: string, columns: Array<[string, string | undefined, boolean?]>): Promise<any[]>;
  /** A tick label formatter: the d3-format `spec`, else a fixed precision from the tick step. */
  tickFormat(ctx: ComponentContext, spec: string | undefined, ticks: number[]): (value: number) => string;
  /** The [min, max] of the finite numbers in `columns` across `rows`; `zero` includes 0. */
  extentOf(rows: Array<Record<string, unknown>>, columns: Array<string | undefined>, options?: { zero?: boolean }): [number, number];
  /** Category keys in display order (see the contract for `sort`). */
  rank(items: Array<{ key: string; value: number | null; columns?: Record<string, number | string | null> }>, sort: unknown): string[];
  /** Splits points sorted by x at `at` into an observed and a forecast part sharing the boundary point. */
  splitAt<P>(points: P[], at: number, x?: (p: P) => number): { observed: P[]; forecast: P[] };
  /** Pushes label positions at least `gap` apart, within `range` where it can. */
  spread(ys: number[], gap: number, range?: [number, number]): number[];
  /** Places a label `width` px wide for a mark from `start` to `end`: past the end, inside it, or past the start. */
  fit(end: number, start: number, width: number, range?: [number, number], gap?: number): { x: number; anchor: "start" | "end"; inside: boolean };
  /** Wraps text to at most `maxLines` lines of `maxChars` characters. */
  wrapLabel(text: string, maxChars: number, maxLines: number): string[];
  /** A fixed pseudo-random order of the unique ids, a function of the ids and the seed only. */
  drawOrder(ids: Array<string | number>, seed?: number): string[];
  /** A vertical offset per x (a beeswarm) that keeps nearby points apart. */
  swarm(xs: number[], options: { r: number; maxDy: number }): number[];

  /** The element's size, the label font and the margins: `margin` is an object or a function of `{ font, charW, w, h }`. */
  frame(el: HTMLElement, ctx: ComponentContext, margin: ChartMargin | ((m: { font: number; charW: number; w: number; h: number }) => ChartMargin)): ChartFrame;
  /** A keyed join: an update clears `.sd-exiting`, an exit sets it, nothing is removed. */
  keyed(selection: any, data: any[], key: (d: any, i: number, nodes: any) => string | number, enter: (enter: any) => any): any;
  /** The start of an end-state write: removes `.sd-exiting` nodes and `style`/`opacity` attributes under `root`. Pass the SVG root, never the element box. */
  settle(root: Element | any): void;
  dot(selection: any, options: { r: PerNode<number>; color: PerNode<string>; hollow?: PerNode<boolean> }): any;
  whisker(selection: any, options: { at: PerNode<number>; lo: PerNode<number>; hi: PerNode<number>; cap: PerNode<number>; orient?: "horizontal" | "vertical" }): any;
  /** The `d` of an interval band over `{ px, lo, hi }`; `null` when no point is defined. */
  band(points: Array<{ px: number; lo: number | null; hi: number | null }>): string;
  rule(selection: any, options: { x1: PerNode<number>; y1: PerNode<number>; x2: PerNode<number>; y2: PerNode<number>; label?: PerNode<string>; anchor?: PerNode<"start" | "middle" | "end"> }): void;
  /** Adds class `sd-halo` (returns the selection), or with `under: true` ensures a `.sd-halo-under` copy before each node (returns the copies). */
  halo(selection: any, options?: { under?: boolean }): any;
  /** One `canvas.sd-canvas-layer` per element, placed on the plot; its context is scaled so you draw in plot pixels. */
  canvasLayer(el: HTMLElement, plot: { left: number; top: number; pw: number; ph: number }): HTMLCanvasElement;
  /** Clears the canvas and strokes the lines; returns a signature (hex) of what was painted. */
  paintLines(canvas: HTMLCanvasElement, lines: CanvasLine[], defaults?: { width?: number; alpha?: number }): string;
  /** `ctx.animate.tween(0, 1, frame)` over the step's duration (else `factor` x --sd-duration), the theme's easing and the step's signal. */
  morph(info: Partial<UpdateInfo>, ctx: ComponentContext, frame: (t: number) => void, options?: { factor?: number; duration?: number }): Promise<void>;
  /** What an owned entrance needs: `draw` (a draw entrance that is not aborted), `duration`, `ease`, `signal`. */
  entrance(info: Partial<UpdateInfo>, ctx: ComponentContext, options?: { factor?: number }): { draw: boolean; duration: number; ease: (t: number) => number; signal: AbortSignal | undefined };
  /** Hides an SVG path along its length: the start state of a draw. */
  undraw(path: SVGGeometryElement): void;

  /** The theme's `--sd-color-dim` for a mark out of focus, else `color`. */
  focusPaint(ctx: ComponentContext, color: string, dimmed: boolean): string;
  /** Tweens a colour in RGB through `ctx.animate.tween`, calling `set(color)` each frame. */
  tweenColor(ctx: ComponentContext, from: string, to: string, set: (color: string) => void, options?: MotionTiming | { duration?: number; ease?: (t: number) => number; signal?: AbortSignal }): Promise<void>;
  /** `color` darkened (or lightened on a dark background) until it has 4.5:1 contrast with `background`, for text. */
  textColor(color: string, background: string, min?: number): string;
}

export interface ComponentContext {
  /** d3 v7. */
  d3: any;
  /**
   * Mount a component (built-in or deck) inside this one. Resolves after its mount; rejects when the
   * child's mount throws. Children pause and are destroyed with their parent.
   */
  mount<P extends Props = Props>(type: string, el: HTMLElement, props: P): Promise<ChildHandle<P>>;
  /** Resolved theme values, keyed by full custom-property name, e.g. tokens["--sd-color-accent"]. */
  tokens: { [cssVariable: string]: string };
  /** The deck's palette of that kind, else the theme default; null when there is none. */
  palette(kind?: "categorical" | "sequential" | "diverging"): Palette | null;
  /**
   * Load a data file relative to the deck root (.json, .geojson, .csv). Cached and shared: read-only.
   * CSV: declared types win; an undeclared column is a number only when every value is a plain decimal
   * with no leading zero.
   */
  data(path: string, opts?: { types?: { [column: string]: CsvType } }): Promise<any>;
  /**
   * The location of a deck file (an image, say) for the browser to fetch: `path` is relative to the deck
   * root, with the same rules as a data path (throws when it is absolute, remote, contains %, or leaves the deck).
   * Nothing is read; a missing file shows up when the browser loads it.
   */
  assetUrl(path: string): string;
  /** d3-format specifier -> formatter, localized by the deck language. */
  format(spec: string): (value: number) => string;
  /** Engine string in the deck language. */
  t(key: string): string;
  /** Rendering for capture (screenshots, PDF): no animation. */
  capture: boolean;
  animate: AnimateHelpers;
  motion: MotionHelpers;
  /** Size of el in canvas pixels, measured at mount. */
  size: { w: number; h: number };
  /**
   * This element's resolved props at every step of its slide: index = step index, length = the slide's step
   * count, bindings resolved as for `update`. Computed once before `mount`, frozen. An entry is `null` when that
   * step does not fold or the element's bindings fail there (the step's own navigation reports the error), so
   * skip `null` entries. The whole value is `null` for a child mounted with `ctx.mount`.
   */
  stepProps: ReadonlyArray<Props | null> | null;
  /** The shared chart building blocks (marks, joins, motion, canvas layer): one frozen object. */
  chart: ChartKit;
}

// ---------------------------------------------------------------------------------------------
// Runtime (spec §9): window.STEPDECK

export interface ElementState {
  type: string;
  /**
   * Resolved props (bindings applied); raw props for a failed element. For an accent text (`accent: true`, e.g. the
   * title), values bound into `text` carry the escaped form (`*` as `\*`, `\` as `\\`), so data never makes an
   * accent phrase; use stripAccent (core/accent.js) for the plain text.
   */
  props: Props;
  visible: boolean;
  collapse: boolean;
  enter?: EnterExit;
  exit?: EnterExit;
  ghost?: boolean | string;
  region?: string;
  box?: Box;
}

export interface SlideState {
  slide: string;
  step: number;
  stepId: string | number;
  /**
   * The raw title string (the title element's `text` before bindings): it may contain accent `*` marks and `\*`
   * escapes. stripAccent (core/accent.js) gives the plain text shown on screen.
   */
  title?: string;
  notes?: string;
  transition?: Transition;
  elements: { [elementId: string]: ElementState };
}

export interface StepdeckFlags {
  slide?: string;
  step?: StepRef;
  capture: boolean;
  motion: boolean;
  /** Whether forward-by-one moves animate on this page. */
  animate: boolean;
  lang?: string;
  theme?: string;
}

export interface Stepdeck {
  /** Resolves once the first slide is shown; never rejects. */
  readonly ready: Promise<void>;
  readonly slides: string[];
  /** Step ids per slide (the index as a string for a step without id; ["0"] without steps). */
  readonly steps: { [slide: string]: string[] };
  /** Boot errors plus the shown slide's: "slide: message" or "slide/element: message". */
  readonly errors: string[];
  /** Resolves when navigation and every update finished; never rejects. */
  settled(): Promise<void>;
  /** Same-slide steps go straight to the controller (abort the running one); slide changes queue. Never rejects. */
  goTo(slide: string, step?: StepRef): Promise<void>;
  state(): SlideState | null;
  readonly flags: StepdeckFlags;
}

declare global {
  interface Window {
    STEPDECK?: Stepdeck;
  }
}

// ---------------------------------------------------------------------------------------------
// CLI (spec §10): problems and the catalog. Every command accepts --json.

/**
 * One problem from validate, check, check --played or catalog. Printed as
 * "slide/element/step · rule · measured vs limit · fix" (missing location parts left out).
 */
export interface Problem {
  slide: string | null;
  element: string | null;
  /** The step id (the index as a string when the step has no id). */
  step: string | null;
  /** Short id, e.g. "unknown-prop", "text-overlap", "played-mismatch", "catalog-schema". */
  rule: string;
  measured: string;
  limit: string;
  fix: string;
  /** validate only: "warning" is printed but exits 0. */
  severity?: "error" | "warning";
}

/** One line of catalog/index.json. */
export interface CatalogEntry {
  kind: "component" | "layout" | "theme";
  name: string;
  /** One sentence: the first of the schema's (a theme: the README's) description. */
  summary: string;
  /** Props whose x-transition is not "snap" (layouts and themes: []). */
  animates: string[];
  /**
   * "own" when the component's schema.json declares `"x-enter": "own"` (it builds its own entrance and its box
   * stays still), else "box" (the element's box moves in; layouts and themes: "box").
   */
  enter: "own" | "box";
}

export interface CatalogProp {
  required: boolean;
  "x-transition": XTransition | null;
  description: string;
  examples: JSONValue[];
  default?: JSONValue;
  /** The prop's JSON Schema without description, examples and x-transition. */
  schema: { [jsonSchemaKeyword: string]: unknown };
}

/** catalog/<name>.json (also `stepdeck catalog <name> --json`). */
export type CatalogDetail =
  | (CatalogEntry & {
      kind: "component";
      origin: "built-in" | "deck";
      description: string;
      required: string[];
      props: { [prop: string]: CatalogProp };
      readme: string | null;
      /** Path of an example slide, e.g. "components/chart.line/example.js". */
      example: string | null;
    })
  | (CatalogEntry & {
      kind: "layout";
      description: string;
      regions: LayoutDescriptor["regions"];
      variables: LayoutDescriptor["variables"];
      readme: string | null;
      example: string | null;
    })
  | (CatalogEntry & {
      kind: "theme";
      description: string;
      /** Custom properties of tokens.css :root, e.g. { "--sd-color-accent": "#0072b2" }. */
      tokens: { [cssVariable: string]: string };
      palettes: ThemePalettes | null;
      readme: string | null;
    });

/** `stepdeck dump --json`: one per step. */
export interface DumpStep {
  slide: string;
  step: number;
  stepId: string;
  elements: { id: string; type: string; visible: boolean; text: string; box: Box; props: Props }[];
  /** Ids whose resolved props or visibility differ from the previous step (all ids at step 0). */
  changed: string[];
  errors: string[];
}
