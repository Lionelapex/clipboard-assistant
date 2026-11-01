export function LumenMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6 6 18M18 6l1.6-1.6" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <a href="#home" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-700 text-white shadow-sm">
            <LumenMark className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block font-serif text-[15px] font-semibold tracking-tight text-brand-700">
              Lumen Foundation
            </span>
            <span className="block text-[9.5px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Community grants
            </span>
          </span>
        </a>

        <nav className="ml-auto hidden items-center gap-6 text-[13px] font-medium text-slate-600 md:flex">
          <a className="transition-colors hover:text-brand-700" href="#home">
            Home
          </a>
          <a className="transition-colors hover:text-brand-700" href="#information">
            Information
          </a>
          <a className="transition-colors hover:text-brand-700" href="#application-form">
            Application form
          </a>
        </nav>

        <a
          href="#application-form"
          className="hidden rounded-lg bg-brand-700 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-900 md:inline-flex"
        >
          Start application
        </a>
      </div>

      <nav className="flex gap-5 overflow-x-auto border-t border-slate-100 px-4 py-2 text-[12.5px] font-medium text-slate-600 md:hidden">
        <a className="whitespace-nowrap hover:text-brand-700" href="#home">
          Home
        </a>
        <a className="whitespace-nowrap hover:text-brand-700" href="#information">
          Information
        </a>
        <a className="whitespace-nowrap hover:text-brand-700" href="#application-form">
          Application form
        </a>
      </nav>
    </header>
  );
}
