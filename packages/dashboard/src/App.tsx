import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { AlertBanner } from './components/AlertBanner';
import { Overview } from './pages/Overview';
import { Security } from './pages/Security';
import { Cost } from './pages/Cost';
import { Memory } from './pages/Memory';
import { Pipelines } from './pages/Pipelines';
import { Setup } from './pages/Setup';

export function App() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AlertBanner />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/security" element={<Security />} />
            <Route path="/cost" element={<Cost />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/pipelines" element={<Pipelines />} />
            <Route path="/setup" element={<Setup />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
