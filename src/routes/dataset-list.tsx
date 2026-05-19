import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Table, Tag, Typography, Modal, Input, Space, Alert } from "antd";
import { PlusOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";
import { FORMAT_LABELS, FORMAT_COLORS } from "../lib/format-converters";
import LogStreamer from "../components/log-streamer";
import { useTranslation } from "react-i18next";

interface Dataset {
  id: string; project_id: string; name: string; format: string;
  image_count: number; class_count: number; classes_json: string;
  path: string; imported_at: string;
}

export default function DatasetList() {
  const navigate = useNavigate();
  const { activeProject } = useWorkspaceStore();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const { t } = useTranslation(["dataset", "common"]);

  const { data: datasets = [], isLoading } = useInvokeQuery<Dataset[]>(
    ["datasets", activeProject?.id ?? ""], "list_datasets",
    { project_id: activeProject?.id ?? "" }, { enabled: !!activeProject }
  );

  const importMutation = useInvokeMutation<string>("import_dataset", {
    invalidateKeys: [["datasets", activeProject?.id ?? ""]],
    onSuccess: () => {
      setImporting(false); setImportModalOpen(false); setImportName(""); setImportPath("");
    },
    onError: () => setImporting(false),
  });

  const deleteMutation = useInvokeMutation<void>("delete_dataset", {
    invalidateKeys: [["datasets", activeProject?.id ?? ""]],
  });

  const handleImport = () => {
    if (!activeProject || !importPath) return;
    setImporting(true);
    setImportLogs([]);
    importMutation.mutate({
      project_id: activeProject.id,
      name: importName || importPath.split(/[/\\]/).pop() || "dataset",
      source_path: importPath,
    });
  };

  const columns = [
    { title: t("common:name"), dataIndex: "name", key: "name" },
    { title: t("common:format"), dataIndex: "format", key: "format", render: (f: string) => <Tag color={FORMAT_COLORS[f] || "default"}>{FORMAT_LABELS[f] || f}</Tag> },
    { title: t("common:images"), dataIndex: "image_count", key: "image_count" },
    { title: t("common:classes"), dataIndex: "class_count", key: "class_count" },
    { title: t("imported"), dataIndex: "imported_at", key: "imported_at", render: (v: string) => v ? new Date(v).toLocaleDateString() : "—" },
    {
      title: t("common:actions"), key: "actions",
      render: (_: unknown, record: Dataset) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/datasets/${record.id}`)}>{t("common:view")}</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteMutation.mutate({ id: record.id })} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{t("title")}</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setImportModalOpen(true)} disabled={!activeProject}>
          {t("importDataset")}
        </Button>
      </div>

      {!activeProject && <Alert message={t("common:selectProjectFirst")} type="info" style={{ marginBottom: 16 }} />}

      <Card>
        <Table dataSource={datasets} columns={columns} rowKey="id" loading={isLoading} pagination={false} />
      </Card>

      <Modal title={t("importDataset")} open={importModalOpen} onOk={handleImport}
        onCancel={() => setImportModalOpen(false)} confirmLoading={importing} okText={t("common:import")}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder={t("importNamePlaceholder")} value={importName} onChange={(e) => setImportName(e.target.value)} />
          <Input placeholder={t("importPathPlaceholder")} value={importPath} onChange={(e) => setImportPath(e.target.value)} />
          {importing && <LogStreamer lines={importLogs} />}
        </Space>
      </Modal>
    </div>
  );
}
