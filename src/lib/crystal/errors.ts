/** Thrown for malformed input files. `line` is the 1-based line number in the text when known. */
export class ParseError extends Error {
  readonly line?: number;
  constructor(message: string, line?: number) {
    super(line === undefined ? message : `line ${line}: ${message}`);
    this.name = 'ParseError';
    if (line !== undefined) this.line = line;
  }
}
