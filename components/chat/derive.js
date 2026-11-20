// chat: everything shown is a pure function of the props (no DOM, no step number).
//
// deriveChat(props) -> { style, newest, messages: [{ index, role, label, text, visible }] }
//   style    "bubbles" (default) or "card"
//   visible  index < (shown ?? messages.length): hidden messages keep their space, they are not removed
//   newest   index of the last visible message (-1 when none): the one `typing` types
// A bad role, style or `shown` throws an error naming it, so the slide shows it instead of a blank chat.

export const ROLES = ["user", "agent", "note"];
export const STYLES = ["bubbles", "card"];

export function deriveChat(props) {
  const { messages, style = "bubbles", shown } = props ?? {};
  if (!Array.isArray(messages) || messages.length === 0) throw new Error("chat needs a non-empty `messages` array");
  if (!STYLES.includes(style)) throw new Error(`chat \`style\` must be one of ${STYLES.join(", ")} (got '${style}')`);
  if (shown !== undefined && !(Number.isInteger(shown) && shown >= 0)) throw new Error(`chat \`shown\` must be an integer >= 0 (got '${shown}')`);

  const count = Math.min(shown ?? messages.length, messages.length);
  return {
    style,
    newest: count - 1,
    messages: messages.map((m, index) => {
      if (!ROLES.includes(m?.role)) throw new Error(`chat message ${index} has role '${m?.role}'; \`role\` must be one of ${ROLES.join(", ")}`);
      if (typeof m.text !== "string") throw new Error(`chat message ${index} needs a string \`text\``);
      if (m.label !== undefined && typeof m.label !== "string") throw new Error(`chat message ${index}: \`label\` must be a string`);
      return { index, role: m.role, label: m.label, text: m.text, visible: index < count };
    }),
  };
}
