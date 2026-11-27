// The small part of the JSZip API that DFT Studio uses, on top of fflate (already a site dependency).
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

interface Entry {
  data: Uint8Array;
  mode?: number;
}

class Folder {
  constructor(
    private readonly zip: MiniZip,
    private readonly prefix: string,
  ) {}
  folder(name: string): Folder {
    return new Folder(this.zip, `${this.prefix}${name.replace(/\/+$/, '')}/`);
  }
  file(name: string, content: string | Uint8Array, opts: { unixPermissions?: string | number } = {}): this {
    const data = typeof content === 'string' ? strToU8(content) : content;
    const p = opts.unixPermissions;
    const mode = p === undefined ? undefined : typeof p === 'string' ? parseInt(p, 8) : p;
    this.zip.entries.set(`${this.prefix}${name}`, { data, mode });
    return this;
  }
}

interface ReadEntry {
  name: string;
  dir: boolean;
  async(type: 'string' | 'uint8array'): Promise<string | Uint8Array>;
}

export class MiniZip extends Folder {
  readonly entries = new Map<string, Entry>();
  files: Record<string, ReadEntry> = {};
  constructor() {
    super(null as unknown as MiniZip, '');
    // The root folder writes into its own map.
    (this as unknown as { zip: MiniZip }).zip = this;
  }
  async generateAsync(opts: { type?: string } = {}): Promise<Blob | Uint8Array> {
    const tree: Zippable = {};
    for (const [path, e] of this.entries) {
      tree[path] =
        e.mode === undefined ? e.data : [e.data, { os: 3, attrs: ((0o100000 | e.mode) << 16) >>> 0 }];
    }
    const bytes = zipSync(tree, { level: 6 });
    return opts.type === 'uint8array' ? bytes : new Blob([bytes as BlobPart], { type: 'application/zip' });
  }
  static async loadAsync(src: Blob | ArrayBuffer | Uint8Array): Promise<MiniZip> {
    const buf =
      src instanceof Uint8Array
        ? src
        : new Uint8Array(src instanceof Blob ? await src.arrayBuffer() : (src as ArrayBuffer));
    const z = new MiniZip();
    const raw = unzipSync(buf);
    for (const [name, data] of Object.entries(raw)) {
      z.files[name] = {
        name,
        dir: name.endsWith('/'),
        async: (type) => Promise.resolve(type === 'string' ? strFromU8(data) : data),
      };
    }
    return z;
  }
}
