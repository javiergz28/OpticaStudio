import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  glassMaterialClass,
  isReducedMotionPreferred,
  type GlassMaterialTier,
} from './GlassControls';

/* ----------------------------------------------------------------------------
   9. GlassDisclosure (Plegable contextual con física Apple)
   ---------------------------------------------------------------------------- */

export interface GlassDisclosureProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggleOpen?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export const GlassDisclosure: React.FC<GlassDisclosureProps> = ({
  title,
  subtitle,
  icon,
  badge,
  defaultOpen = true,
  open: controlledOpen,
  onToggleOpen,
  children,
  className = '',
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? internalOpen;
  const contentId = useId();
  const prefersReduced = isReducedMotionPreferred(useReducedMotion());

  const handleToggle = () => {
    const next = !isOpen;
    if (controlledOpen === undefined) setInternalOpen(next);
    onToggleOpen?.(next);
  };

  return (
    <section className={`py-3.5 border-b border-[var(--border-hairline)] last:border-b-0 ${className}`}>
      <div className="w-full flex items-center justify-between gap-2 py-1">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={handleToggle}
          className="glass-focus-ring flex-1 min-w-0 flex items-center gap-2 text-left rounded-lg cursor-pointer group py-0.5"
        >
          <ChevronRight
            aria-hidden="true"
            className={`w-3.5 h-3.5 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-transform duration-150 ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
          {icon && <span className="shrink-0 opacity-90">{icon}</span>}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)] truncate">
              {title}
            </div>
            {subtitle && (
              <div className="text-[11px] text-[var(--text-tertiary)] truncate">
                {subtitle}
              </div>
            )}
          </div>
        </button>
        {badge && <div className="flex items-center gap-2 shrink-0">{badge}</div>}
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={contentId}
            initial={prefersReduced ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: prefersReduced ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="pt-3 space-y-3"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

/* ----------------------------------------------------------------------------
   10. GlassPopover
   ---------------------------------------------------------------------------- */

export interface GlassPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  align?: 'left' | 'right';
  widthClass?: string;
  material?: GlassMaterialTier;
  ariaLabel?: string;
  children: React.ReactNode;
}

export const GlassPopover: React.FC<GlassPopoverProps> = ({
  open,
  onClose,
  anchorRef,
  align = 'right',
  widthClass = 'w-80',
  material = 'dense',
  ariaLabel = 'Panel contextual',
  children,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prefersReduced = isReducedMotionPreferred(useReducedMotion());

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onClose, anchorRef]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-label={ariaLabel}
          initial={prefersReduced ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
          transition={{ duration: prefersReduced ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
          className={`${glassMaterialClass(material)} absolute top-full mt-2 z-50 rounded-[20px] p-4 ${widthClass} ${
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          }`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ----------------------------------------------------------------------------
   11. GlassContextMenu
   ---------------------------------------------------------------------------- */

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface GlassContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: readonly ContextMenuItem[];
  onClose: () => void;
}

export const GlassContextMenu: React.FC<GlassContextMenuProps> = ({
  open,
  x,
  y,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const prefersReduced = isReducedMotionPreferred(useReducedMotion());

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onClose]);

  const safeLeft =
    typeof window !== 'undefined' ? Math.min(x, Math.max(12, window.innerWidth - 236)) : x;
  const safeTop =
    typeof window !== 'undefined' ? Math.min(y, Math.max(12, window.innerHeight - items.length * 36 - 24)) : y;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          role="menu"
          initial={prefersReduced ? { opacity: 1 } : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          transition={{ duration: prefersReduced ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
          style={{ left: `${safeLeft}px`, top: `${safeTop}px` }}
          className="glass-dense fixed z-[70] min-w-[216px] rounded-[16px] p-1.5 space-y-0.5"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect();
                onClose();
              }}
              className={`glass-focus-ring w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-[10px] text-xs font-medium text-left transition-colors ${
                item.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : item.destructive
                    ? 'text-rose-500 dark:text-rose-300 hover:bg-rose-500/15 cursor-pointer'
                    : 'text-[var(--text-primary)] hover:bg-[var(--studio-surface-subtle)] cursor-pointer'
              }`}
            >
              <span className="inline-flex items-center gap-2 truncate">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </span>
              {item.shortcut && (
                <span className="font-mono text-[10px] text-[var(--text-tertiary)] shrink-0">
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ----------------------------------------------------------------------------
   12. GlassTooltip
   ---------------------------------------------------------------------------- */

export interface GlassTooltipProps {
  content: string;
  shortcut?: string;
  side?: 'top' | 'bottom';
  children: React.ReactElement;
}

export const GlassTooltip: React.FC<GlassTooltipProps> = ({
  content,
  shortcut,
  side = 'bottom',
  children,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={`glass-dense pointer-events-none absolute left-1/2 -translate-x-1/2 z-[60] px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-primary)] whitespace-nowrap flex items-center gap-1.5 ${
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <span>{content}</span>
          {shortcut && (
            <kbd className="font-mono text-[10px] px-1 py-0.2 rounded bg-[var(--studio-surface-subtle)] text-[var(--text-tertiary)] border border-[var(--border-hairline)]">
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </div>
  );
};

/* ----------------------------------------------------------------------------
   13. GlassSidebar (Contenedor izquierdo colapsable / redimensionable)
   ---------------------------------------------------------------------------- */

export interface GlassSidebarProps {
  material?: GlassMaterialTier;
  widthPx: number;
  expanded: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
  className?: string;
}

export const GlassSidebar: React.FC<GlassSidebarProps> = ({
  material = 'regular',
  widthPx,
  expanded,
  ariaLabel = 'Panel lateral del estudio',
  children,
  className = '',
}) => {
  const prefersReduced = isReducedMotionPreferred(useReducedMotion());

  return (
    <motion.aside
      aria-label={ariaLabel}
      initial={false}
      animate={{ width: expanded ? widthPx : 48 }}
      transition={
        prefersReduced
          ? { duration: 0 }
          : { type: 'spring', stiffness: 380, damping: 36, mass: 0.85 }
      }
      className={`${
        expanded
          ? 'flex absolute inset-y-0 left-0 z-35 min-[1160px]:static min-[1160px]:z-10 shadow-2xl min-[1160px]:shadow-none studio-sidebar-drawer'
          : 'hidden min-[900px]:flex relative z-10'
      } flex-col shrink-0 border-r border-[var(--border-hairline)] overflow-hidden ${
        material === 'solid' ? 'glass-solid' : 'studio-chrome-panel'
      } ${className}`}
    >
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">{children}</div>
    </motion.aside>
  );
};

/* ----------------------------------------------------------------------------
   14. GlassInspector (Panel derecho de propiedades técnicas)
   ---------------------------------------------------------------------------- */

export interface GlassInspectorProps {
  ariaLabel?: string;
  children: React.ReactNode;
  className?: string;
}

export const GlassInspector: React.FC<GlassInspectorProps> = ({
  ariaLabel = 'Inspector de propiedades',
  children,
  className = '',
}) => (
  <aside
    aria-label={ariaLabel}
    className={`studio-chrome-panel w-full min-[880px]:w-[clamp(268px,24vw,368px)] border-t min-[880px]:border-t-0 min-[880px]:border-l border-[var(--border-hairline)] flex flex-col shrink-0 max-h-[42vh] min-[880px]:max-h-none overflow-hidden ${className}`}
  >
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</div>
  </aside>
);

/* ----------------------------------------------------------------------------
   15. GlassDialog (Modal accesible Apple 27)
   ---------------------------------------------------------------------------- */

export interface GlassDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  maxWidthClass?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

export const GlassDialog: React.FC<GlassDialogProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-5xl',
  headerActions,
  children,
}) => {
  const prefersReduced = isReducedMotionPreferred(useReducedMotion());

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title ?? 'Ventana de detalle'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.16 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/68 backdrop-blur-md z-50 flex items-center justify-center p-4 lg:p-6"
        >
          <motion.div
            initial={prefersReduced ? { opacity: 1 } : { opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: prefersReduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`glass-dense w-full ${maxWidthClass} rounded-[26px] overflow-hidden flex flex-col max-h-[92vh]`}
          >
            {(title || headerActions) && (
              <div className="px-5 py-3.5 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  {title && (
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {title}
                    </h3>
                  )}
                  {subtitle && (
                    <p className="text-xs font-mono tabular-nums text-[var(--text-tertiary)] truncate mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {headerActions}
                  <button
                    type="button"
                    aria-label="Cerrar"
                    onClick={onClose}
                    className="liquid-glass-btn glass-focus-ring w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
