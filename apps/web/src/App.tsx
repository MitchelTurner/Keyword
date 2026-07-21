import { Link, NavLink, Route, Routes } from "react-router-dom";
import NicheListPage from "./pages/NicheListPage";
import NicheDetailPage from "./pages/NicheDetailPage";
import PortfolioPage from "./pages/PortfolioPage";

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "relative rounded px-2.5 py-1 text-sm transition-colors",
    isActive
      ? "bg-zinc-800/80 text-zinc-50"
      : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200",
  ].join(" ");
}

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-5">
            <Link to="/" className="group flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight text-emerald-400 transition-colors group-hover:text-emerald-300">
                Prospector
              </span>
              <span className="hidden text-[11px] uppercase tracking-[0.14em] text-zinc-600 sm:inline">
                research
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              <NavLink to="/" end className={navClass}>
                Niches
              </NavLink>
              <NavLink to="/portfolio" className={navClass}>
                Portfolio
              </NavLink>
            </nav>
          </div>
          <span className="hidden text-xs text-zinc-600 md:inline">
            keyword → opportunity
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-7">
        <Routes>
          <Route path="/" element={<NicheListPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/niches/:id" element={<NicheDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
