import { useState } from "react";
import { Card, Button, Table, Tag, Typography, Descriptions } from "antd";
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined, SyncOutlined } from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";

interface YoloEnv {
  id: string; version: string; venv_path: string; python_path: string;
  status: string; cuda_available: boolean; installed_at: string | null;
}

interface PrereqCheck {
  python_found: boolean; python_version: string; cuda_available: boolean;
}

const YOLO_VERSIONS = ["8", "11"];

export default function EnvManager() {
  const [installing, setInstalling] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const { data: prereqs, isLoading: prereqLoading } = useInvokeQuery<PrereqCheck>(["prereqs"], "check_prereqs");

  const { data: envs = [], isLoading: envsLoading } = useInvokeQuery<YoloEnv[]>(["envs"], "list_envs");

  const installMutation = useInvokeMutation<string>("install_yolo", {
    invalidateKeys: [["envs"]],
    onSuccess: () => { setInstalling(null); setLogs([]); },
    onError: () => { setInstalling(null); },
  });

  const deleteMutation = useInvokeMutation<void>("delete_env", { invalidateKeys: [["envs"]] });

  const handleInstall = (version: string) => {
    setInstalling(version);
    setLogs([]);
    installMutation.mutate({ version });
  };

  const columns = [
    { title: "Version", dataIndex: "version", key: "version", render: (v: string) => <Tag color="blue">YOLO v{v}</Tag> },
    {
      title: "Status", dataIndex: "status", key: "status",
      render: (s: string) => {
        const color = s === "installed" ? "green" : s === "installing" ? "processing" : "default";
        const icon = s === "installed" ? <CheckCircleOutlined /> : s === "installing" ? <SyncOutlined spin /> : null;
        return <Tag color={color} icon={icon}>{s}</Tag>;
      },
    },
    { title: "CUDA", dataIndex: "cuda_available", key: "cuda", render: (v: boolean) => v ? <Tag color="green">Available</Tag> : <Tag>CPU Only</Tag> },
    { title: "Installed", dataIndex: "installed_at", key: "installed_at", render: (v: string | null) => v ?? "—" },
    {
      title: "Actions", key: "actions",
      render: (_: unknown, record: YoloEnv) => (
        <Button danger size="small" icon={<DeleteOutlined />}
          onClick={() => deleteMutation.mutate({ id: record.id })} />
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={3}>Environment Manager</Typography.Title>

      {!prereqLoading && prereqs && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={3} size="small">
            <Descriptions.Item label="Python">
              {prereqs.python_found ? <Tag color="green">{prereqs.python_version}</Tag> : <Tag color="red">Not Found</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="CUDA">
              {prereqs.cuda_available ? <Tag color="green">Available</Tag> : <Tag>Not Detected</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Available Versions">
              {YOLO_VERSIONS.map(v => (
                <Button key={v} size="small" type="primary" icon={<PlusOutlined />}
                  onClick={() => handleInstall(v)}
                  loading={installing === v}
                  disabled={installing !== null || envs.some(e => e.version === v && e.status === "installed")}
                  style={{ marginRight: 8 }}>
                  Install v{v}
                </Button>
              ))}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {installing && (
        <Card size="small" title={`Installing YOLO v${installing}...`} style={{ marginBottom: 16 }}>
          <div style={{ height: 200, overflow: "auto", background: "#1a1a2e", color: "#e0e0e0", fontFamily: "monospace", fontSize: 12, padding: 8, borderRadius: 4 }}>
            {logs.length === 0 && <div>Starting installation...</div>}
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </Card>
      )}

      <Card>
        <Table dataSource={envs} columns={columns} rowKey="id" loading={envsLoading} pagination={false} />
      </Card>
    </div>
  );
}
