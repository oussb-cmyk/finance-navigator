import { Outlet, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { useProjectStore } from '@/store/useProjectStore';

export function WorkspaceLayout() {
  const { projectId } = useParams();
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);

  useEffect(() => {
    if (projectId) setCurrentProject(projectId);
    return () => setCurrentProject(null);
  }, [projectId, setCurrentProject]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <WorkspaceSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border bg-card px-4 shrink-0">
            <SidebarTrigger className="mr-3" />
            <div className="flex-1" />
          </header>
          <main className="flex-1 overflow-auto p-6 animate-fade-in">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
