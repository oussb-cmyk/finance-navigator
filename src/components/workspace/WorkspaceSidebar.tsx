import {
  LayoutDashboard,
  Database,
  GitBranch,
  Tags,
  BookOpen,
  FileText,
  BarChart3,
  FileOutput,
  Download,
  ChevronLeft,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useProjectStore } from '@/store/useProjectStore';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { useNavigate } from 'react-router-dom';

const navItems = [
  { title: 'Overview', url: 'overview', icon: LayoutDashboard },
  { title: 'Data Center', url: 'data-center', icon: Database },
  { title: 'Mapping', url: 'mapping', icon: GitBranch },
  { title: 'Journal Entries', url: 'journal-entries', icon: BookOpen },
  { title: 'Financial Statements', url: 'statements', icon: FileText },
  { title: 'Dashboard', url: 'dashboard', icon: BarChart3 },
  { title: 'Reports', url: 'reports', icon: FileOutput },
  { title: 'Export', url: 'export', icon: Download },
];

export function WorkspaceSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const navigate = useNavigate();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const project = useProjectStore((s) => s.projects.find(p => p.id === s.currentProjectId));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-3 py-2 text-sidebar-foreground hover:text-sidebar-primary-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="text-xs font-medium truncate">All Projects</span>}
        </button>
        {!collapsed && project && (
          <div className="px-3 pb-2">
            <h2 className="text-sm font-semibold text-sidebar-primary-foreground truncate">{project.name}</h2>
            <p className="text-xs text-sidebar-muted truncate">{project.company}</p>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={`/project/${currentProjectId}/${item.url}`}
                      end
                      className="hover:bg-sidebar-accent/60"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-sidebar-primary flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground">
              F
            </div>
            <div>
              <p className="text-xs font-medium text-sidebar-primary-foreground">Finance Hub</p>
              <p className="text-[10px] text-sidebar-muted">v1.0.0</p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
