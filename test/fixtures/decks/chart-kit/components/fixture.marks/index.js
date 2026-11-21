// fixture.marks: one of each shared chart mark, drawn only through `ctx.chart` (no imports). A pure
// function of props: `update` ends by writing the end state (the keyed joins, then settle, then every attribute), and a played
// step first morphs from the previous `k` to the new one.
const SVG = "http://www.w3.org/2000/svg";

export default {
  async mount(el, props, ctx) {
    const { chart: C, d3, tokens } = ctx;
    const doc = el.ownerDocument;
    const svg = d3.select(el).append(() => doc.createElementNS(SVG, "svg")).attr("class", "fixture-marks").attr("display", "block");
    const plot = svg.append("g").attr("class", "fixture-plot");
    const area = plot.append("rect").attr("class", "fixture-plot-area").attr("fill", "none").attr("stroke", "none");
    const gVline = plot.append("g");
    const gRule = plot.append("g");
    const gWhisker = plot.append("g");
    const gDots = plot.append("g");
    const gText = plot.append("g");
    const gExtra = plot.append("g");
    const colors = ctx.palette?.("categorical")?.colors ?? [];
    const ink = tokens["--sd-color-ink"].trim();
    const load = () => C.loadTable(props, ctx, "fixture.marks", [["x", props.x], ["y", props.y]]);
    let last = null;
    await load();

    /** The layout for props and rows: the frame, the scales, the plot size. */
    const layout = (rows, p) => {
      const f = C.frame(el, ctx, ({ font, charW }) => ({ left: charW * 3, right: font, top: font * 1.5, bottom: font * 1.5 }));
      const x = d3.scaleLinear().domain(C.extentOf(rows, [p.x])).range([0, f.pw]);
      const y = d3.scaleLinear().domain(C.extentOf(rows, [p.y], { zero: true })).range([f.ph, 0]);
      return { f, rows, p, k: Number(p.k ?? 0), points: rows.map((r) => [Number(r[p.x]), Number(r[p.y])]), x, y };
    };

    const one = (key) => [{ key }];
    /** The keyed joins: marks that appear are created, marks that leave get `.sd-exiting` (nothing is removed yet). */
    function join(m) {
      const by = (d) => d.key;
      C.keyed(gVline.selectAll("path.fixture-vline"), one("v"), by, (enter) => enter.append("path").attr("class", "fixture-vline"));
      C.keyed(gRule.selectAll("g.fixture-rule"), one("r"), by, (enter) => enter.append("g").attr("class", "fixture-rule"));
      C.keyed(gWhisker.selectAll("g.fixture-whisker"), one("w"), by, (enter) => enter.append("g").attr("class", "fixture-whisker"));
      C.keyed(gDots.selectAll("circle"), [{ key: "filled", hollow: false }, { key: "hollow", hollow: true }], by, (enter) => enter.append("circle"));
      C.keyed(gText.selectAll("text"), one("t"), by, (enter) => enter.append("text"));
      // A mark that exists on one step only (k = 1), with a halo under it: it enters and leaves as steps move.
      C.keyed(gExtra.selectAll("path.fixture-extra"), m.k === 1 ? one("x") : [], by, (enter) => enter.append("path").attr("class", "fixture-extra"));
    }

    /** Writes every mark for the layout `m` with `k` moves done (`k` is fractional while a morph plays). */
    function place(m, k) {
      const { f } = m;
      const u = k / 2;
      svg.attr("width", f.w).attr("height", f.h).attr("viewBox", `0 0 ${f.w} ${f.h}`);
      plot.attr("transform", `translate(${f.margin.left},${f.margin.top})`);
      area.attr("width", f.pw).attr("height", f.ph);

      // A vertical line with a halo under it: the canvas lines cross it, and it paints above them.
      const vline = gVline.selectAll("path.fixture-vline:not(.sd-exiting)")
        .attr("d", `M${f.pw * 0.5},0V${f.ph}`).attr("fill", "none").attr("stroke", colors[2] ?? ink).attr("stroke-width", 5);
      C.halo(vline, { under: true });

      const extra = gExtra.selectAll("path.fixture-extra:not(.sd-exiting)")
        .attr("d", `M${f.pw * 0.7},${f.ph * 0.35}L${f.pw * 0.85},${f.ph * 0.5}`).attr("fill", "none").attr("stroke", colors[3] ?? ink).attr("stroke-width", 5);
      C.halo(extra, { under: true });

      C.rule(gRule.selectAll("g.fixture-rule"), { x1: 0, y1: f.ph * 0.6, x2: f.pw, y2: f.ph * 0.6, label: "Reference", anchor: "end" });

      C.whisker(gWhisker.selectAll("g.fixture-whisker"), { at: f.ph * 0.9, lo: f.pw * 0.15, hi: f.pw * (0.45 + 0.3 * u), cap: f.font * 0.5 });

      const dots = gDots.selectAll("circle")
        .attr("cx", (d) => (d.hollow ? f.pw * 0.1 : f.pw * (0.1 + 0.3 * u)))
        .attr("cy", (d) => (d.hollow ? f.ph * (0.15 + 0.15 * u) : f.ph * 0.15));
      C.dot(dots, { r: f.font * 0.4, color: (d) => colors[d.hollow ? 1 : 0] ?? ink, hollow: (d) => d.hollow });

      const label = gText.selectAll("text")
        .attr("x", f.pw * (0.3 + 0.2 * u)).attr("y", f.ph * 0.3).attr("fill", ink).attr("font-size", f.font).text("Halo");
      C.halo(label);

      // The canvas: a horizontal line across the vertical one, a second one, and the data as a polyline.
      const canvas = C.canvasLayer(el, { left: f.margin.left, top: f.margin.top, pw: f.pw, ph: f.ph });
      const series = m.points.map(([px, py]) => [m.x(px), m.y(py) * (0.7 + 0.3 * (1 - u))]);
      const signature = C.paintLines(canvas, [
        { points: [[0, f.ph * 0.25], [f.pw, f.ph * 0.25]], color: colors[0] ?? ink, width: 12 },
        { points: [[0, f.ph * 0.75], [f.pw * (0.5 + 0.4 * u), f.ph * 0.75]], color: colors[1] ?? ink, alpha: 0.6 },
        { points: series, color: colors[3] ?? ink },
        { points: [[f.pw, 0]], color: ink },
      ], { width: 4 });
      canvas.setAttribute("data-signature", signature);
    }

    return {
      async update(props, info = {}) {
        const m = layout(await load(), props);
        join(m); // joins first: they mark the leavers; settle then removes them
        if (info.animate && last && !info.entered && !info.signal?.aborted) {
          const from = last.k;
          await C.morph(info, ctx, (t) => place(m, from + (m.k - from) * t), { factor: 1 });
        }
        C.settle(svg.node());
        place(m, m.k);
        last = m;
      },
      destroy() {
        svg.remove();
        el.querySelector(":scope > canvas.sd-canvas-layer")?.remove();
      },
    };
  },
};
