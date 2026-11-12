import { useId, useState, type DragEvent } from 'react';

interface Props {
  /** What to open, for the label: "XDATCAR". */
  what: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  /** Current file name, shown after loading. */
  loaded?: string;
  optional?: boolean;
}

/** File chooser that also accepts a dropped file. The native input stays visible, so it works by keyboard and touch. */
export default function DropFile({ what, onFile, disabled, loaded, optional }: Props) {
  const id = useId();
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f && !disabled) onFile(f);
  };
  return (
    <div
      className={`df${over ? ' df-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <label htmlFor={id} className="df-label">
        {what}
        {optional ? ' (optional)' : ''}
      </label>
      <input
        id={id}
        type="file"
        disabled={disabled}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = '';
        }}
      />
      <span className="df-note">
        {loaded ? `Loaded: ${loaded}. ` : 'Choose a file or drop it here. '}Read in your browser; nothing is
        uploaded.
      </span>
    </div>
  );
}

/** Progress bar shown while a big file is parsed. */
export function ParseStatus({ busy, progress, error }: { busy: boolean; progress: number; error: string }) {
  return (
    <>
      {busy && (
        <p role="status" className="av-status">
          Reading the file...{' '}
          <progress max={1} value={progress} aria-label="Reading progress">
            {Math.round(progress * 100)} %
          </progress>
        </p>
      )}
      {error && (
        <p role="alert" className="av-error">
          {error}
        </p>
      )}
    </>
  );
}
