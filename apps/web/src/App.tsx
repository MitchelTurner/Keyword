import { Link, Route, Routes } from "react-router-dom";
import NicheListPage from "./pages/NicheListPage";
import NicheDetailPage from "./pages/NicheDetailPage";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight text-emerald-400">
            Prospector
          </Link>
          <span className="text-xs text-zinc-500">
            keyword opportunity research
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={<NicheListPage />} />
          <Route path="/niches/:id" element={<NicheDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
