declare namespace App {
  interface Locals {
    /** Source ids in order of first <Cite> use on the current page; set by the topic route. */
    cites?: string[];
    /** Running count of <Term> on the current page, for unique popover ids. */
    termCount?: number;
    /** The topic being rendered (id and the concepts it teaches); set by the topic route for <Check>. */
    topic?: { id: string; concepts: string[] };
  }
}
