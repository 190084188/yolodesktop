import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import AppShell from "./components/app-shell";
import Dashboard from "./routes/dashboard";
import EnvManager from "./routes/env-manager";
import DatasetList from "./routes/dataset-list";
import DatasetDetail from "./routes/dataset-detail";
import TrainingSetup from "./routes/training-setup";
import TrainingMonitor from "./routes/training-monitor";
import ModelViewer from "./routes/model-viewer";
import ExportManager from "./routes/export-manager";
import PluginManager from "./routes/plugin-manager";
import Settings from "./routes/settings";

export default function App() {
  const [isDark, setIsDark] = useState(true);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: "#1677ff" },
      }}
    >
      <Routes>
        <Route element={<AppShell isDark={isDark} onToggleTheme={() => setIsDark(!isDark)} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/env" element={<EnvManager />} />
          <Route path="/datasets" element={<DatasetList />} />
          <Route path="/datasets/:id" element={<DatasetDetail />} />
          <Route path="/train" element={<TrainingSetup />} />
          <Route path="/train/:runId" element={<TrainingMonitor />} />
          <Route path="/models" element={<ModelViewer />} />
          <Route path="/export" element={<ExportManager />} />
          <Route path="/plugins" element={<PluginManager />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </ConfigProvider>
  );
}
