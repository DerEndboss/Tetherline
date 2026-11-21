
export interface SwitchProps {
  label: string;
  /** One short line under the label. */
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}

/** A whole row that switches something on or off: label, hint and a knob that slides (controls.css). */
export function Switch({ label, hint, checked, onChange, className }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={className ? `sw-row ${className}` : 'sw-row'} onClick={() => onChange(!checked)}>
      <span className="sw-text">
        <span className="sw-label">{label}</span>
        {hint && <span className="sw-hint">{hint}</span>}
      </span>
      <span className="sw-track" aria-hidden="true">
        <span className="sw-knob" />
      </span>
    </button>
  );
}
