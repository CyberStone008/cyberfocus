import { Sidebar } from '../components/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <div className="appContent">
        {children}
      </div>
    </>
  );
}
