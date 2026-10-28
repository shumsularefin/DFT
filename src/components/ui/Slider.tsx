import { useId, useState } from 'react';
import './Slider.css';

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  unit?: string;
  onChange?: (value: number) => void;
}

/** Labelled range input with a live value readout. Uses the native control, so arrows, Home, End and PageUp/Down work. */
export default function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  defaultValue = min,
  unit,
  onChange,
}: SliderProps) {
  const id = useId();
  const [inner, setInner] = useState(defaultValue);
  const v = value ?? inner;
  return (
    <div className="slider">
      <label htmlFor={id} className="slider-label">
        {label}
      </label>
      <div className="slider-row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          onChange={(e) => {
            const n = Number(e.target.value);
            setInner(n);
            onChange?.(n);
          }}
        />
        <output htmlFor={id} className="slider-value">
          {v}
          {unit ? ` ${unit}` : ''}
        </output>
      </div>
    </div>
  );
}
