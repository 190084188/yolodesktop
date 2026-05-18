import { useState } from "react";
import { Card, Button, Table, Tag, Typography, Space, Modal, Descriptions, message } from "antd";
import { PlusOutlined, DeleteOutlined, ScanOutlined } from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";

interface Plugin {
  id: string; name: string; version: string; supported_formats: string[];
  launcher_path: string; description: string; is_installed: boolean;
}

export default function PluginManager() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);

  const { data: plugins = [], isLoading, refetch } = useInvokeQuery<Plugin[]>(["plugins"], "scan_plugins");

  const installMutation = useInvokeMutation<void>("install_plugin", {
    onSuccess: () => { refetch(); message.success("Plugin installed"); },
  });

  const removeMutation = useInvokeMutation<void>("remove_plugin", {
    onSuccess: () => { refetch(); message.success("Plugin removed"); },
  });

  const columns = [
    { title: "Name", dataIndex: "name", key: "name", render: (v: string) => <strong>{v}</strong> },
    { title: "Version", dataIndex: "version", key: "version" },
    { title: "Formats", dataIndex: "supported_formats", key: "formats",
      render: (formats: string[]) => formats.map(f => <Tag key={f} color="blue" style={{ marginBottom: 2 }}>{f}</Tag>) },
    { title: "Status", dataIndex: "is_installed", key: "is_installed",
      render: (installed: boolean) => installed ? <Tag color="green">Installed</Tag> : <Tag color="default">Not Installed</Tag> },
    {
      title: "Actions", key: "actions",
      render: (_: unknown, record: Plugin) => (
        <Space>
          <Button size="small" onClick={() => { setSelectedPlugin(record); setDetailOpen(true); }}>Details</Button>
          {record.is_installed ? (
            <Button size="small" danger icon={<DeleteOutlined />}
              onClick={() => removeMutation.mutate({ id: record.id })}>Remove</Button>
          ) : (
            <Button size="small" type="primary" icon={<PlusOutlined />}
              onClick={() => installMutation.mutate({
                name: record.name, version: record.version,
                launcher_path: record.launcher_path,
                formats_json: JSON.stringify(record.supported_formats),
              })}>Install</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Plugin Manager</Typography.Title>
        <Button icon={<ScanOutlined />} onClick={() => refetch()}>Scan for Plugins</Button>
      </div>

      <Card>
        <Table dataSource={plugins} columns={columns} rowKey="id" loading={isLoading} pagination={false} />
      </Card>

      <Modal title={selectedPlugin?.name} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null}>
        {selectedPlugin && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Version">{selectedPlugin.version}</Descriptions.Item>
            <Descriptions.Item label="Description">{selectedPlugin.description}</Descriptions.Item>
            <Descriptions.Item label="Launcher">{selectedPlugin.launcher_path}</Descriptions.Item>
            <Descriptions.Item label="Supported Formats">
              {selectedPlugin.supported_formats.map(f => <Tag key={f}>{f}</Tag>)}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
