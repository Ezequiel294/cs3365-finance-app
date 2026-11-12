/** Grey blocks in the shape of the page's tiles and sections (loading.tsx). */
export function Skeleton({ tiles = 4, sections = 2, wide = true }: { tiles?: number; sections?: number; wide?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-6 h-8 w-48 rounded-[6px] bg-border" />
      {tiles ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => (
            <div key={i} className="h-24 rounded-[8px] bg-border/70" />
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: sections }, (_, i) => (
          <div key={i} className="h-64 rounded-[8px] bg-border/60" />
        ))}
        {wide ? <div className="h-64 rounded-[8px] bg-border/60 lg:col-span-2" /> : null}
      </div>
    </div>
  );
}
