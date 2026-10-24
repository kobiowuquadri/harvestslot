export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden focusable="false">
        <rect width="64" height="64" rx="14" fill={inverted ? '#ffffff' : '#143e31'} />
        <path d="M18 40c6-14 16-20 28-22-2 12-8 22-22 28" fill="none" stroke="#e8b56b" strokeWidth="5" strokeLinecap="round" />
        <path d="M20 46l8-8" stroke={inverted ? '#143e31' : '#ffffff'} strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className={`text-lg font-semibold tracking-tight ${inverted ? 'text-white' : 'text-forest'}`}>HarvestSlot</span>
    </span>
  );
}
