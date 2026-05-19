import { useState } from "react";
import { Card, Button, Table, Tag, Typography, Space, Modal, Descriptions, message } from "antd";
import { PlusOutlined, DeleteOutlined, ScanOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";

interface Plugin {
  id: string; name: string; version: string; supported_formats: string[];
  launcher_path: string; description: string; is_installed: boolean;
}

export default function PluginManager() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const { t } = useTranslation(["plugins", "common"]);

  const { data: plugins = [], isLoading, refetch } = useInvokeQuery<Plugin[]>(["plugins"], "scan_plugins");

  const installMutation = useInvokeMutation<void>("install_plugin", {
    onSuccess: () => { refetch(); message.success(t("common:pluginInstalled")); },
  });

  const removeMutation = useInvokeMutation<void>("remove_plugin", {
    onSuccess: () => { refetch(); message.success(t("common:pluginRemoved")); },
  });

  const columns = [
    { title: t("common:name"), dataIndex: "name", key: "name", render: (v: string) => <strong>{v}</strong> },
    { title: t("common:version"), dataIndex: "version", key: "version" },
    { title: t("pluginFormats"), dataIndex: "supported_formats", key: "formats",
      render: (formats: string[]) => formats.map(f => <Tag key={f} color="blue" style={{ marginBottom: 2 }}>{f}</Tag>) },
    { title: t("common:status"), dataIndex: "is_installed", key: "is_installed",
      render: (installed: boolean) => installed ? <Tag color="green">{t("installedPlugins")}</Tag> : <Tag color="default">{t("common:notInstalled")}</Tag> },
    {
      title: t("common:actions"), key: "actions",
      render: (_: unknown, record: Plugin) => (
        <Space>
          <Button size="small" onClick={() => { setSelectedPlugin(record); setDetailOpen(true); }}>{t("common:details")}</Button>
          {record.is_installed ? (
            <Button size="small" danger icon={<DeleteOutlined />}
              onClick={() => removeMutation.mutate({ id: record.id })}>{t("removePlugin")}</Button>
          ) : (
            <Button size="small" type="primary" icon={<PlusOutlined />}
              onClick={() => installMutation.mutate({
                name: record.name, version: record.version,
                launcher_path: record.launcher_path,
                formats_json: JSON.stringify(record.supported_formats),
              })}>{t("installPlugin")}</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{t("title")}</Typography.Title>
        <Button icon={<ScanOutlined />} onClick={() => refetch()}>{t("common:scanPlugins")}</Button>
      </div>

      <Card>
        <Table dataSource={plugins} columns={columns} rowKey="id" loading={isLoading} pagination={false} />
      </Card>

      <Modal title={selectedPlugin?.name} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null}>
        {selectedPlugin && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t("common:version")}>{selectedPlugin.version}</Descriptions.Item>
            <Descriptions.Item label={t("common:description")}>{selectedPlugin.description}</Descriptions.Item>
            <Descriptions.Item label={t("common:launcher")}>{selectedPlugin.launcher_path}</Descriptions.Item>
            <Descriptions.Item label={t("common:supportedFormats")}>
              {selectedPlugin.supported_formats.map(f => <Tag key={f}>{f}</Tag>)}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
