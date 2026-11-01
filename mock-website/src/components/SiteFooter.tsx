import { LumenMark } from './SiteHeader';

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-700 text-white">
              <LumenMark className="h-4.5 w-4.5" />
            </span>
            <span className="font-serif text-[14px] font-semibold text-brand-700">Lumen Foundation</span>
          </div>
          <p className="mt-3 max-w-sm text-[12px] leading-relaxed text-slate-500">
            A grant-making foundation supporting community-led organisations across the UK. Registered charity
            no. 1184421.
          </p>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Funding</h3>
          <ul className="mt-3 space-y-2 text-[12.5px] text-slate-600">
            <li><a className="hover:text-brand-700" href="#information">Guidance for applicants</a></li>
            <li><a className="hover:text-brand-700" href="#application-form">Community Impact Grant</a></li>
            <li><a className="hover:text-brand-700" href="#information">Assessment criteria</a></li>
          </ul>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Contact</h3>
          <ul className="mt-3 space-y-2 text-[12.5px] text-slate-600">
            <li>grants@lumenfoundation.org.uk</li>
            <li>020 7946 0142</li>
            <li>Mon–Fri, 09:00–17:00</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 Lumen Foundation. All rights reserved.</p>
          <div className="flex gap-4">
            <a className="hover:text-brand-700" href="#information">Privacy</a>
            <a className="hover:text-brand-700" href="#information">Accessibility</a>
            <a className="hover:text-brand-700" href="#information">Complaints</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
