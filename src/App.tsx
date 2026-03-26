import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import HomePage from "./pages/HomePage";
import NotFound from "./pages/NotFound";
import { WorkspaceLayout } from "./components/workspace/WorkspaceLayout";
import OverviewPage from "./pages/workspace/OverviewPage";
import DataCenterPage from "./pages/workspace/DataCenterPage";
import MappingPage from "./pages/workspace/MappingPage";
import JournalClassificationPage from "./pages/workspace/JournalClassificationPage";
import JournalEntriesPage from "./pages/workspace/JournalEntriesPage";
import StatementsPage from "./pages/workspace/StatementsPage";
import DashboardPage from "./pages/workspace/DashboardPage";
import ReportsPage from "./pages/workspace/ReportsPage";
import ExportPage from "./pages/workspace/ExportPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/project/:projectId" element={<WorkspaceLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="data-center" element={<DataCenterPage />} />
            <Route path="mapping" element={<MappingPage />} />
            <Route path="journal-entries" element={<JournalEntriesPage />} />
            <Route path="statements" element={<StatementsPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="export" element={<ExportPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
