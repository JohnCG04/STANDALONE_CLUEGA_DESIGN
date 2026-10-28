/**
 * Draws `<br>` inside a table cell as a line break.
 *
 * A markdown table row is one line, so a model that wants two lines in a cell writes
 * `<br>` there ("Mục 1<br>Mục 2"). The parser reads that tag as an inline `html` node,
 * and `react-markdown` does not render raw HTML (no `rehype-raw`, on purpose: the text
 * comes from a model), so the tag was printed as the four characters it is. This turns
 * exactly that node, in exactly that place, into the markdown line break the renderer
 * already knows, so nothing else in the answer can start emitting HTML.
 *
 * Runs after `remark-gfm` in the plugin list: the table cells exist once it has parsed.
 */

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** The whole node is one line-break tag, in any of its spellings. */
const BR_TAG = /^\s*<br\s*\/?>\s*$/i;

function breaksInCell(cell: MdNode): void {
  if (!cell.children) return;
  cell.children = cell.children.map((child) => {
    if (child.type === "html" && typeof child.value === "string" && BR_TAG.test(child.value)) {
      return { type: "break" };
    }
    // Emphasis, links and the like keep their inline children inside.
    if (child.type !== "inlineCode") breaksInCell(child);
    return child;
  });
}

function walk(node: MdNode): void {
  if (node.type === "tableCell") {
    breaksInCell(node);
    return;
  }
  node.children?.forEach(walk);
}

/** The remark plugin: `() => (tree) => void`. */
export function remarkTableBreaks() {
  return (tree: MdNode): void => walk(tree);
}
