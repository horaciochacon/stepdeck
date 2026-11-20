// Raw html in a message is shown as text; inline markdown still renders.
export default {
  id: "escape",
  layout: "full-bleed",
  title: "Escape",
  elements: [
    { id: "chat", region: "main", type: "chat",
      props: { messages: [
        { role: "user", text: "<script>window.__pwned = 1</script> con **negrita** y `código`" },
        { role: "agent", text: "<img src=x onerror=\"window.__pwned=1\"> y [malo](javascript:window.__pwned=1) y [bueno](#ok)" },
      ] } },
  ],
};
