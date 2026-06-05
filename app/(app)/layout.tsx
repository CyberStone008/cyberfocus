import { Sidebar } from '../components/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {children}
      </div>
    </>
  );
}
