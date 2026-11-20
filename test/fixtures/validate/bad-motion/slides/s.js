// enter names a motion that does not exist (rize); validate suggests rise.
export default {
  id: "s", title: "Bad motion",
  elements: [
    { id: "note", type: "text", props: { text: "Hello." }, enter: "rize" },
  ],
};
