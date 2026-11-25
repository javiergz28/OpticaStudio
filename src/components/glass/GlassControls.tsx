import React, { useId } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

export type GlassMaterialTier = 'clear' | 'regular' | 'dense' | 'solid';

export function glassMaterialClass(tier: GlassMaterialTier): string {
  switch (tier) {
    case 'clear':
      return 'glass-clear';
    case 'regular':
      return 'glass-regular';
    case 'dense':
      return 'glass-dense';
    case 'solid':
      return 'glass-solid';
  }
}

export function isReducedMotionPreferred(hookReducedMotion: boolean | null): boolean {
  if (hookReducedMotion) return true;
  if (typeof document !== 'undefined') {
    return document.documentElement.getAttribute('data-reduced-motion') === 'true';
  }
  return false;
}

/* ----------------------------------------------------------------------------
   1. GlassButton
   ---------------------------------------------------------------------------- */

export interface GlassButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: 'clear' | 'regular' | 'primary' | 'amber' | 'danger' | 'ghost';
  size?: 'xs' | 'sm' | 'md';
  selected?: boolean;
  loading?: boolean;
  error?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  children: React.ReactNode;
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    {
      variant = 'regular',
      size = 'sm',
      selected = false,
      loading = false,
      error = false,
      disabled = false,
      leadingIcon,
      trailingIcon,
      className = '',
      children,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const sizeClass =
      size === 'xs'
        ? 'h-7 px-2.5 text-[11px] gap-1.5'
        : size === 'md'
          ? 'h-9 px-4 text-xs gap-2'
          : 'h-8 px-3.5 text-xs gap-1.5';

    let variantClass = 'liquid-glass-btn';
    if (error) {
      variantClass =
        'bg-rose-500/18 border border-rose-400/50 text-rose-600 dark:text-rose-200 hover:bg-rose-500/25';
    } else if (variant === 'primary') {
      variantClass = 'liquid-glass-blue font-semibold';
    } else if (variant === 'amber') {
      variantClass = 'liquid-glass-amber font-semibold';
    } else if (variant === 'danger') {
      variantClass =
        'bg-gradient-to-b from-[#FF453A] to-[#E02424] border border-rose-300/45 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_6px_18px_-4px_rgba(255,59,48,0.45)] hover:brightness-108 active:scale-[0.965] font-semibold';
    } else if (variant === 'ghost') {
      variantClass = selected
        ? 'liquid-glass-btn-active'
        : 'bg-transparent border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--studio-surface-subtle)]';
    } else if (variant === 'clear') {
      variantClass = selected
        ? 'liquid-glass-btn-active'
        : 'glass-clear text-[var(--text-primary)] hover:brightness-105';
    } else if (selected) {
      variantClass = 'liquid-glass-btn-active';
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-pressed={selected || undefined}
        aria-busy={loading || undefined}
        className={`glass-focus-ring inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap shrink-0 transition-[transform,filter,background-color,border-color,color] duration-150 ${sizeClass} ${variantClass} ${
          isDisabled
            ? 'opacity-45 cursor-not-allowed pointer-events-none'
            : 'cursor-pointer active:scale-[0.97]'
        } ${className}`}
        {...rest}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : leadingIcon}
        <span className="truncate">{children}</span>
        {!loading && trailingIcon}
      </button>
    );
  }
);
GlassButton.displayName = 'GlassButton';

/* ----------------------------------------------------------------------------
   2. GlassIconButton
   ---------------------------------------------------------------------------- */

export interface GlassIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'clear' | 'regular' | 'primary' | 'amber' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  loading?: boolean;
  error?: boolean;
  label: string;
}

export const GlassIconButton = React.forwardRef<HTMLButtonElement, GlassIconButtonProps>(
  (
    {
      variant = 'regular',
      size = 'md',
      selected = false,
      loading = false,
      error = false,
      disabled = false,
      label,
      className = '',
      children,
      type = 'button',
      title,
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const dimClass =
      size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';

    let variantClass = 'liquid-glass-btn';
    if (error) {
      variantClass =
        'bg-rose-500/20 border border-rose-400/50 text-rose-500 dark:text-rose-200';
    } else if (variant === 'primary') {
      variantClass = 'liquid-glass-blue';
    } else if (variant === 'amber') {
      variantClass = 'liquid-glass-amber';
    } else if (variant === 'danger') {
      variantClass =
        'bg-rose-500/22 border border-rose-400/45 text-rose-500 dark:text-rose-200 hover:bg-rose-500/30';
    } else if (variant === 'clear') {
      variantClass = selected
        ? 'liquid-glass-btn-active'
        : 'glass-clear text-[var(--text-primary)]';
    } else if (selected) {
      variantClass = 'liquid-glass-btn-active';
    }

    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={title ?? label}
        aria-pressed={selected || undefined}
        aria-busy={loading || undefined}
        disabled={isDisabled}
        className={`glass-focus-ring inline-flex items-center justify-center rounded-full shrink-0 transition-[transform,background-color,border-color,color] duration-150 ${dimClass} ${variantClass} ${
          isDisabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer active:scale-[0.95]'
        } ${className}`}
        {...rest}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
      </button>
    );
  }
);
GlassIconButton.displayName = 'GlassIconButton';

/* ----------------------------------------------------------------------------
   3. GlassToolbar
   ---------------------------------------------------------------------------- */

export interface GlassToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  material?: GlassMaterialTier;
  noDrag?: boolean;
}

export const GlassToolbar: React.FC<GlassToolbarProps> = ({
  material = 'regular',
  noDrag = true,
  className = '',
  children,
  ...rest
}) => (
  <div
    className={`${glassMaterialClass(material)} rounded-full flex items-center gap-2 px-2.5 py-1.5 ${
      noDrag ? '[-webkit-app-region:no-drag]' : ''
    } ${className}`}
    {...rest}
  >
    {children}
  </div>
);

/* ----------------------------------------------------------------------------
   4. GlassSegmentedControl (Apple 27 Spring Sliding Indicator)
   ---------------------------------------------------------------------------- */

export interface SegmentedOption<T extends string> {
  id: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface GlassSegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  layoutGroupId?: string;
  size?: 'xs' | 'sm';
  fullWidth?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function GlassSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutGroupId,
  size = 'sm',
  fullWidth = false,
  disabled = false,
  ariaLabel,
  className = '',
}: GlassSegmentedControlProps<T>) {
  const autoGroup = useId();
  const groupId = layoutGroupId ?? `seg-${autoGroup}`;
  const prefersReduced = isReducedMotionPreferred(useReducedMotion());

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const enabled = options.filter((o) => !o.disabled);
    const idx = enabled.findIndex((o) => o.id === value);
    if (idx < 0) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = enabled[(idx + 1) % enabled.length];
      onChange(next.id);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = enabled[(idx - 1 + enabled.length) % enabled.length];
      onChange(prev.id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`liquid-segmented ${
        fullWidth ? 'grid' : 'inline-flex items-center'
      } gap-0.5 ${disabled ? 'opacity-55' : ''} ${className}`}
      style={
        fullWidth
          ? { gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {options.map((opt) => {
        const isSelected = opt.id === value;
        const isItemDisabled = disabled || opt.disabled;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={isItemDisabled}
            title={opt.title}
            onClick={() => {
              if (!isItemDisabled && opt.id !== value) onChange(opt.id);
            }}
            className={`glass-focus-ring relative rounded-full font-medium whitespace-nowrap shrink-0 transition-colors duration-150 ${
              size === 'xs' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
            } ${
              isSelected
                ? 'text-[var(--segment-thumb-text)] font-semibold'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            } ${isItemDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            {isSelected && (
              <motion.span
                layoutId={groupId}
                aria-hidden="true"
                transition={
                  prefersReduced
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 460, damping: 35, mass: 0.8 }
                }
                className="liquid-segment-thumb absolute inset-0 rounded-full"
              />
            )}
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5 truncate">
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   5. GlassSlider
   ---------------------------------------------------------------------------- */

export interface GlassSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  displayValue?: string;
  onChange: (value: number) => void;
  onReset?: () => void;
  disabled?: boolean;
  error?: boolean;
  ariaLabel?: string;
  className?: string;
}

export const GlassSlider: React.FC<GlassSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  displayValue,
  onChange,
  onReset,
  disabled = false,
  error = false,
  ariaLabel,
  className = '',
}) => {
  const id = useId();
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <label
          htmlFor={id}
          onDoubleClick={onReset}
          title={onReset ? 'Doble clic para restablecer' : undefined}
          className={`select-none ${
            error
              ? 'text-rose-500 dark:text-rose-300'
              : 'text-[var(--text-secondary)]'
          } ${onReset ? 'cursor-pointer' : ''}`}
        >
          {label}
        </label>
        <span className="font-mono tabular-nums text-[11px] font-medium text-[var(--text-primary)]">
          {displayValue ?? value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full studio-slider ${error ? 'border-rose-400/60' : ''}`}
      />
    </div>
  );
};

/* ----------------------------------------------------------------------------
   6. GlassToggle
   ---------------------------------------------------------------------------- */

export interface GlassToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  subtle?: boolean;
  disabled?: boolean;
}

export const GlassToggle: React.FC<GlassToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  subtle = false,
  disabled = false,
}) => (
  <div className="flex items-center justify-between gap-3 py-1">
    <div
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`min-w-0 flex-1 select-none ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <div
        className={`text-xs leading-snug ${
          subtle ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)] font-medium'
        }`}
      >
        {label}
      </div>
      {description && (
        <div className="text-[11px] text-[var(--text-tertiary)] leading-snug mt-0.5">
          {description}
        </div>
      )}
    </div>
    <button
      type="button"
      role="switch"
      disabled={disabled}
      aria-checked={checked}
      aria-label={label}
      data-checked={checked ? 'true' : 'false'}
      onClick={() => onChange(!checked)}
      className="apple-switch"
    >
      <span className="apple-switch-thumb" />
    </button>
  </div>
);

/* ----------------------------------------------------------------------------
   7. GlassSelect
   ---------------------------------------------------------------------------- */

export interface GlassSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: boolean;
}

export const GlassSelect: React.FC<GlassSelectProps> = ({
  label,
  error = false,
  className = '',
  children,
  ...rest
}) => {
  const id = useId();
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-[11px] text-[var(--text-tertiary)]">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className={`liquid-input w-full appearance-none rounded-xl pl-3 pr-8 py-2 text-xs font-medium cursor-pointer ${
            error ? 'border-rose-400/60' : ''
          } ${className}`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]"
        />
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------------------
   8. GlassStatusIndicator (strictly real runtime state, never decorative)
   ---------------------------------------------------------------------------- */

export interface GlassStatusIndicatorProps {
  tone: 'neutral' | 'live' | 'recording' | 'paused' | 'warning' | 'error';
  label: string;
  monoDetail?: string;
  compact?: boolean;
  className?: string;
}

export const GlassStatusIndicator: React.FC<GlassStatusIndicatorProps> = ({
  tone,
  label,
  monoDetail,
  compact = false,
  className = '',
}) => {
  const toneColor =
    tone === 'recording'
      ? 'text-rose-500 dark:text-rose-300'
      : tone === 'live'
        ? 'text-emerald-600 dark:text-emerald-300'
        : tone === 'warning' || tone === 'paused'
          ? 'text-amber-600 dark:text-amber-300'
          : tone === 'error'
            ? 'text-rose-600 dark:text-rose-300'
            : 'text-[var(--text-secondary)]';

  const dotColor =
    tone === 'recording'
      ? 'bg-rose-500'
      : tone === 'live'
        ? 'bg-emerald-500'
        : tone === 'warning' || tone === 'paused'
          ? 'bg-amber-400'
          : tone === 'error'
            ? 'bg-rose-500'
            : 'bg-[var(--text-tertiary)]';

  return (
    <div
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
        compact ? 'text-[11px]' : 'text-xs'
      } ${toneColor} ${className}`}
    >
      {(tone === 'recording' || tone === 'live' || tone === 'error') && (
        <span
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${
            tone === 'recording' ? 'animate-pulse' : ''
          }`}
        />
      )}
      <span className="font-medium">{label}</span>
      {monoDetail && (
        <>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <span className="font-mono tabular-nums opacity-90">{monoDetail}</span>
        </>
      )}
    </div>
  );
};
