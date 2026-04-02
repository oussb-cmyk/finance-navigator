import { useState, useRef } from 'react';
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
  ChevronRight,
  BookOpenCheck,
  CreditCard,
  HelpCircle,
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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useNavigate, useLocation } from 'react-router-dom';

const navItems = [
  { title: 'Overview', url: 'overview', icon: LayoutDashboard },
  { title: 'Journal Classification', url: 'journal-classification', icon: Tags },
  { title: 'Mapping', url: 'mapping', icon: GitBranch },
  { title: 'Journal Entries', url: 'journal-entries', icon: BookOpen },
  { title: 'Financial Statements', url: 'statements', icon: FileText },
  { title: 'Dashboard', url: 'dashboard', icon: BarChart3 },
  { title: 'Reports', url: 'reports', icon: FileOutput },
  { title: 'Export', url: 'export', icon: Download },
];

const importOptions = [
  {
    key: 'gl',
    icon: BookOpenCheck,
    title: 'General Ledger (GL)',
    desc: 'Structured accounting data (debit/credit)',
    flow: 'gl' as const,
  },
  {
    key: 'tx',
    icon: CreditCard,
    title: 'Transactions',
    desc: 'Bank / operational data (CSV, Qonto, Excel)',
    flow: 'tx' as const,
  },
  {
    key: 'auto',
    icon: HelpCircle,
    title: 'Auto-detect',
    desc: 'Upload a file and we detect the format',
    flow: 'auto' as const,
  },
];

export function WorkspaceSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const navigate = useNavigate();
  const location = useLocation();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const project = useProjectStore((s) => s.projects.find(p => p.id === s.currentProjectId));
  const [dcMenuOpen, setDcMenuOpen] = useState(false);

  const dataCenterPath = `/project/${currentProjectId}/data-center`;
  const isDataCenterActive = location.pathname.startsWith(dataCenterPath);

  const handleImportOption = (flow: 'gl' | 'tx' | 'auto') => {
    setDcMenuOpen(false);
    navigate(`${dataCenterPath}?import=${flow}`);
  };

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
              {/* Data Center — special item with popover submenu */}
              <SidebarMenuItem>
                <Popover open={dcMenuOpen} onOpenChange={setDcMenuOpen}>
                  <div className="flex items-center w-full">
                    <PopoverTrigger asChild>
                      <button
                        className={`flex-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent/60 ${
                          isDataCenterActive ? 'bg-sidebar-accent text-sidebar-primary font-medium' : ''
                        }`}
                      >
                        <Database className="mr-0 h-4 w-4 shrink-0" />
                        {!collapsed && <span>Data Center</span>}
                      </button>
                    </PopoverTrigger>
                    {!collapsed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(dataCenterPath);
                        }}
                        className="shrink-0 p-1 rounded hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground transition-colors"
                        title="Open Data Center page"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <PopoverContent
                    side="right"
                    align="start"
                    sideOffset={8}
                    className="w-[320px] p-0 shadow-lg border rounded-xl"
                  >
                    <div className="p-3 border-b">
                      <p className="text-sm font-semibold text-foreground">Import your data</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Choose a data type to import</p>
                    </div>
                    <div className="p-1.5">
                      {importOptions.map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => handleImportOption(opt.flow)}
                          className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent group"
                        >
                          <div className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary group-hover:bg-primary/20 transition-colors">
                            <opt.icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{opt.title}</p>
                            <p className="text-xs text-muted-foreground leading-snug">{opt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="border-t p-2">
                      <button
                        onClick={() => {
                          setDcMenuOpen(false);
                          navigate(dataCenterPath);
                        }}
                        className="w-full text-xs text-center py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        Open Data Center →
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </SidebarMenuItem>

              {/* Other nav items */}
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
