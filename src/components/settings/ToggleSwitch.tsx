import React, { useId } from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  id,
}) => {
  const autoId = useId();
  const inputId = id || autoId;

  return (
    <label
      htmlFor={inputId}
      className={`inline-flex items-center gap-2 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <button
        role="switch"
        id={inputId}
        type="button"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative inline-flex h-[22px] w-[40px] shrink-0 items-center
          rounded-full transition-colors duration-200 ease-in-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1
          ${checked ? 'bg-accent' : 'bg-surface-5 border border-border-muted'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-[16px] w-[16px]
            rounded-full bg-white shadow-sm
            transition-transform duration-200 ease-in-out
            ${checked ? 'translate-x-[21px]' : 'translate-x-[3px]'}
          `}
        />
      </button>
      {label && (
        <span className="text-[11px] text-txt-muted select-none">{label}</span>
      )}
    </label>
  );
};
