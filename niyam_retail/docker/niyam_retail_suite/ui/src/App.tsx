import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import DashboardPage from './pages/DashboardPage';
import { Wave1 } from './pages/Wave1';
import { Wave2 } from './pages/Wave2';
import { Wave3 } from './pages/Wave3';
import { Wave4 } from './pages/Wave4';
import { Wave5 } from './pages/Wave5';
import { Wave6 } from './pages/Wave6';
import { Wave7 } from './pages/Wave7';
import { Button } from '../../../shared/components/ui';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

function App() {
  const [view, setView] = useState<'dashboard'|'wave1'|'wave2'|'wave3'|'wave4'|'wave5'|'wave6'|'wave7'>('dashboard');

  const NavButton = ({ name, label }: { name: typeof view; label: string }) => (
    <Button 
      variant={view === name ? 'default' : 'outline'} 
      size="sm"
      onClick={() => setView(name)}
    >
      {label}
    </Button>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <div className="bg-card border-b px-4 py-3 flex items-center gap-2 overflow-x-auto">
          <NavButton name="dashboard" label="Dashboard" />
          <NavButton name="wave1" label="Wave 1" />
          <NavButton name="wave2" label="Wave 2" />
          <NavButton name="wave3" label="Wave 3" />
          <NavButton name="wave4" label="Wave 4" />
          <NavButton name="wave5" label="Wave 5" />
          <NavButton name="wave6" label="Wave 6" />
          <NavButton name="wave7" label="Wave 7" />
        </div>
        {view === 'dashboard' && <DashboardPage />}
        {view === 'wave1' && <Wave1 />}
        {view === 'wave2' && <Wave2 />}
        {view === 'wave3' && <Wave3 />}
        {view === 'wave4' && <Wave4 />}
        {view === 'wave5' && <Wave5 />}
        {view === 'wave6' && <Wave6 />}
        {view === 'wave7' && <Wave7 />}
      </div>
    </QueryClientProvider>
  );
}

export default App;
