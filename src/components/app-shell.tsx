import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Select, Button, Typography, theme as antTheme, Modal, Input, Space, App } from "antd";
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
  PlusOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { useWorkspaceStore, type Project } from "../stores/workspace-store";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import ErrorBoundary from "./error-boundary";
import { useTranslation } from "react-i18next";

const { Sider, Header, Content } = Layout;

interface AppShellProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export default function AppShell({ isDark, onToggleTheme }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { activeProject, projects, setProjects, setActiveProject } = useWorkspaceStore();
  const { token } = antTheme.useToken();
  const { message } = App.useApp();
  const { t } = useTranslation("common");

  const { data: loadedProjects } = useInvokeQuery<Project[]>(["projects"], "list_projects");

  useEffect(() => {
    if (loadedProjects) {
      setProjects(loadedProjects);
    }
  }, [loadedProjects, setProjects]);

  const createProjectMutation = useInvokeMutation<string>("create_project", {
    invalidateKeys: [["projects"]],
    onSuccess: () => {
      setCreateModalOpen(false);
      setNewProjectName("");
      setNewProjectPath("");
      message.success(t("projectCreated"));
    },
  });

  const handleCreateProject = () => {
    if (!newProjectName || !newProjectPath) return;
    createProjectMutation.mutate({ name: newProjectName, path: newProjectPath });
  };

  const handleBrowsePath = async () => {
    // Use native folder picker from tauri-plugin-dialog
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, title: t("projectPathSelectTitle") });
      if (selected && typeof selected === "string") setNewProjectPath(selected);
    } catch {
      // Fallback: user types path manually
    }
  };

  const menuItems = [
    { key: "/", icon: <DashboardOutlined />, label: t("dashboard") },
    { key: "/env", icon: <CloudServerOutlined />, label: t("envManager") },
    { key: "/datasets", icon: <DatabaseOutlined />, label: t("datasets") },
    { key: "/train", icon: <ExperimentOutlined />, label: t("training") },
    { key: "/models", icon: <ApartmentOutlined />, label: t("modelGraph") },
    { key: "/export", icon: <ExportOutlined />, label: t("export") },
    { key: "/plugins", icon: <AppstoreOutlined />, label: t("plugins") },
    { key: "/settings", icon: <SettingOutlined />, label: t("settings") },
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
            {collapsed ? t("appTitleShort") : t("appTitle")}
          </Typography.Title>
        </div>

        {!collapsed && (
          <div style={{ padding: "0 16px 12px" }}>
            <Space.Compact style={{ width: "100%" }}>
              <Select
                style={{ flex: 1 }}
                placeholder={t("selectProject")}
                value={activeProject?.id}
                onChange={(id) => {
                  const project = projects.find((p) => p.id === id);
                  setActiveProject(project ?? null);
                }}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                notFoundContent={t("noProjects")}
              />
              <Button
                icon={<PlusOutlined />}
                onClick={() => setCreateModalOpen(true)}
                title={t("createProject")}
              />
            </Space.Compact>
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
          <Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {activeProject ? `${t("currentProject")}: ${activeProject.name}` : t("noProjectSelected")}
            </Typography.Text>
            <Button
              type="text"
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={onToggleTheme}
            />
          </Space>
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

      <Modal
        title={t("createProject")}
        open={createModalOpen}
        onOk={handleCreateProject}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={createProjectMutation.isPending}
        okText={t("create")}
        cancelText={t("cancel")}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <div>
            <Typography.Text>{t("projectName")}</Typography.Text>
            <Input
              placeholder={t("projectName")}
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
            />
          </div>
          <div>
            <Typography.Text>{t("projectPath")}</Typography.Text>
            <Input
              placeholder={t("projectPath")}
              value={newProjectPath}
              onChange={(e) => setNewProjectPath(e.target.value)}
              addonAfter={
                <Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={handleBrowsePath} />
              }
            />
          </div>
        </Space>
      </Modal>
    </Layout>
  );
}
