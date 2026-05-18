import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Select, Button, Typography, theme as antTheme } from "antd";
import {
  DashboardOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  ApartmentOutlined,
  ExportOutlined,
  AppstoreOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SunOutlined,
  MoonOutlined,
} from "@ant-design/icons";
import { useWorkspaceStore } from "../stores/workspace-store";
import ErrorBoundary from "./error-boundary";

const { Sider, Header, Content } = Layout;

interface AppShellProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export default function AppShell({ isDark, onToggleTheme }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { activeProject, projects, setActiveProject } = useWorkspaceStore();
  const { token } = antTheme.useToken();

  const menuItems = [
    { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
    { key: "/env", icon: <CloudServerOutlined />, label: "Environments" },
    { key: "/datasets", icon: <DatabaseOutlined />, label: "Datasets" },
    { key: "/train", icon: <ExperimentOutlined />, label: "Training" },
    { key: "/models", icon: <ApartmentOutlined />, label: "Model Graph" },
    { key: "/export", icon: <ExportOutlined />, label: "Export" },
    { key: "/plugins", icon: <AppstoreOutlined />, label: "Plugins" },
    { key: "/settings", icon: <SettingOutlined />, label: "Settings" },
  ];

  const selectedKey = "/" + location.pathname.split("/")[1];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={240}
        style={{
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgElevated,
        }}
      >
        <div style={{
          padding: collapsed ? "16px 8px" : "16px",
          textAlign: "center",
        }}>
          <Typography.Title level={4} style={{ margin: 0, color: token.colorPrimary }}>
            {collapsed ? "YD" : "YoloDesktop"}
          </Typography.Title>
        </div>

        {!collapsed && (
          <div style={{ padding: "0 16px 12px" }}>
            <Select
              style={{ width: "100%" }}
              placeholder="Select project"
              value={activeProject?.id}
              onChange={(id) => {
                const project = projects.find((p) => p.id === id);
                setActiveProject(project ?? null);
              }}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
        )}

        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: "transparent", borderRight: 0 }}
        />
      </Sider>

      <Layout>
        <Header style={{
          padding: "0 16px",
          background: token.colorBgContainer,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Button
            type="text"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={onToggleTheme}
          />
        </Header>

        <Content style={{
          margin: 16,
          padding: 24,
          background: token.colorBgContainer,
          borderRadius: token.borderRadius,
          overflow: "auto",
          minHeight: 280,
        }}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  );
}
