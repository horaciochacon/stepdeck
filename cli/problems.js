// Problems reported by the CLI (spec §10): validate, check, check --played and shoot share them.
//
// Problem = { slide, element, step, rule, measured, limit, fix }
//   slide, element, step   where (element and step may be null for slide- or deck-wide problems)
//   rule                   short id, e.g. "played-mismatch"
//   measured, limit        what was found and what was expected, as short strings
//   fix                    one suggested fix
//
// formatProblem(p) -> "slide/element/step · rule · measured vs limit · suggested fix"
//   Missing location parts are left out ("slide/step", "slide").
//
// componentProblem({ slide, element, step }, { rule, id, message, limit?, fix? }) -> Problem
//   Maps a component's pure finding (e.g. diagram's diagram-id / diagram-overlap) to a Problem.
export function problem({ slide = null, element = null, step = null, rule, measured = "", limit = "", fix = "" }) {
  return { slide, element, step, rule, measured: String(measured), limit: String(limit), fix: String(fix) };
}

/**
 * A component's own finding -> Problem. `item` is { rule, id, message, limit?, fix? } as returned by a pure
 * problems function (components/diagram/place.js diagramProblems); `where` is { slide, element, step }.
 * measured is the message (it names the id).
 */
export function componentProblem(where, item) {
  return problem({ ...where, rule: item.rule, measured: item.message, limit: item.limit ?? "", fix: item.fix ?? "" });
}

export function formatProblem(p) {
  const where = [p.slide, p.element, p.step].filter((v) => v !== null && v !== undefined && v !== "").join("/");
  return `${where || "deck"} · ${p.rule} · ${p.measured} vs ${p.limit} · ${p.fix}`;
}

export function formatProblems(problems) {
  return problems.map(formatProblem).join("\n");
}
