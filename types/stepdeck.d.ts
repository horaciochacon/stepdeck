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

export type EnterExit = "fade" | "rise" | "wipe" | "draw" | "none";

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
  enter?: EnterExit;
  exit?: EnterExit;
  /** Hidden elements keep their space unless collapse is true. */
  collapse?: boolean;
  /** Visible from this step on. */
  from?: StepRef;
  /** Visible only at these steps. */
  at?: StepRef[];
  advance?: Advance;
}

export interface Transition {
  /** Delay between items, ms. */
  stagger?: number;
  /** Duration, ms. */
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
  /** Size of el in canvas pixels, measured at mount. */
  size: { w: number; h: number };
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
