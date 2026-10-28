import { useState } from 'react';
import './Toggle.css';

interface ToggleProps {
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
}

/** Switch button: role="switch", Space and Enter toggle, 44 px target, state shown as text as well as position. */
export default function Toggle({ label, checked, defaultChecked = false, onChange }: ToggleProps) {
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="toggle"
      onClick={() => {
        setInner(!on);
        onChange?.(!on);
      }}
    >
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
      <span className="toggle-state">{on ? 'On' : 'Off'}</span>
    </button>
  );
}
