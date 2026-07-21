import { Link, NavLink, Route, Routes } from "react-router-dom";
import NicheListPage from "./pages/NicheListPage";
import NicheDetailPage from "./pages/NicheDetailPage";
import PortfolioPage from "./pages/PortfolioPage";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-semibold tracking-tight text-emerald-400">
              Prospector
            </Link>
            <nav className="flex gap-3 text-sm">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  isActive ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }
              >
                Niches
              </NavLink>
              <NavLink
                to="/portfolio"
                className={({ isActive }) =>
                  isActive ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }
              >
                Portfolio
              </NavLink>
            </nav>
          </div>
          <span className="text-xs text-zinc-500">
            keyword opportunity research
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={<NicheListPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/niches/:id" element={<NicheDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
