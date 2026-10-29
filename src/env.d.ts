declare namespace App {
  interface Locals {
    /** Source ids in order of first <Cite> use on the current page; set by the topic route. */
    cites?: string[];
    /** Running count of <Term> on the current page, for unique popover ids. */
    termCount?: number;
  }
}
