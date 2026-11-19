/** Shared HarvestSlot brand identity. */
export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/harvestslot-mark.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={className}
    />
  );
}

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <span className={inverted ? 'inline-flex rounded-lg bg-white p-1' : 'inline-flex'}>
        <LogoMark />
      </span>
      <span
        className={`font-display text-[20px] font-semibold tracking-[-0.045em] ${inverted ? 'text-white' : 'text-ink'}`}
      >
        Harvest<span className={inverted ? 'text-white' : 'text-forest'}>Slot</span>
      </span>
    </span>
  );
}
