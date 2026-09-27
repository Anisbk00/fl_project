/** Admin page skeleton: heading, toolbar, table rows. Renders under AdminNav. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 skeleton" />
        <div className="h-4 w-72 skeleton" />
      </div>
      <div className="flex gap-2">
        <div className="h-10 w-64 skeleton" />
        <div className="h-10 w-32 skeleton" />
      </div>
      <div className="rounded-xl border border-line overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0">
            <div className="h-4 w-1/4 skeleton" />
            <div className="h-4 w-1/5 skeleton" />
            <div className="h-4 w-1/6 skeleton ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
