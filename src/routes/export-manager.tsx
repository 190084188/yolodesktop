import { useState } from "react";
import { Card, Button, Table, Tag, Typography, Select, Space, message } from "antd";
import { ExportOutlined, DownloadOutlined } from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";
import LogStreamer from "../components/log-streamer";

export default function ExportManager() {
  const { activeProject } = useWorkspaceStore();
  const [selectedRun, setSelectedRun] = useState<string>();
  const [logs, setLogs] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const { data: runs = [] } = useInvokeQuery<Array<Record<string, unknown>>>(
    ["training-runs", activeProject?.id ?? ""], "list_training_runs",
    { project_id: activeProject?.id ?? "" }, { enabled: !!activeProject }
  );

  const { data: checkpoints = [] } = useInvokeQuery<Array<Record<string, unknown>>>(
    ["checkpoints", selectedRun ?? ""], "list_checkpoints",
    { run_id: selectedRun ?? "" }, { enabled: !!selectedRun }
  );

  const { data: exportedModels = [] } = useInvokeQuery<Array<Record<string, unknown>>>(
    ["exported-models", selectedRun ?? ""], "list_exported_models",
    { run_id: selectedRun ?? "" }, { enabled: !!selectedRun }
  );

  const exportMutation = useInvokeMutation<string>("export_onnx", {
    invalidateKeys: [["exported-models", selectedRun ?? ""]],
    onSuccess: () => { setExporting(false); message.success("Export complete!"); },
    onError: () => setExporting(false),
  });

  const handleExport = (checkpointId?: string) => {
    if (!selectedRun) return;
    setExporting(true);
    setLogs([]);
    exportMutation.mutate({ run_id: selectedRun, checkpoint_id: checkpointId });
  };

  const completedRuns = (runs as Array<{ id: string; status: string; best_map50: number | null; checkpoint_dir: string | null }>).filter(
    (r) => r.status === "completed" || r.status === "stopped"
  );

  const modelColumns = [
    { title: "Format", dataIndex: "format", key: "format", render: (f: string) => <Tag color="blue">{String(f).toUpperCase()}</Tag> },
    { title: "File Path", dataIndex: "file_path", key: "file_path", ellipsis: true },
    { title: "Size", dataIndex: "file_size", key: "file_size", render: (v: number | null) => v ? `${(v / 1e6).toFixed(1)} MB` : "—" },
    { title: "Exported", dataIndex: "exported_at", key: "exported_at", render: (v: string) => new Date(v).toLocaleString() },
    { title: "", key: "actions", render: () => <Button size="small" icon={<DownloadOutlined />} disabled>Open Folder</Button> },
  ];

  const cpColumns = [
    { title: "Epoch", dataIndex: "epoch", key: "epoch" },
    { title: "mAP50", dataIndex: "map50", key: "map50", render: (v: number | null) => v?.toFixed(4) ?? "—" },
    { title: "Loss", dataIndex: "loss", key: "loss", render: (v: number | null) => v?.toFixed(4) ?? "—" },
    {
      title: "", key: "actions",
      render: (_: unknown, record: { id: string }) => (
        <Button size="small" type="primary" icon={<ExportOutlined />}
          onClick={() => handleExport(record.id)} loading={exporting}>Export ONNX</Button>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={3}>Model Export</Typography.Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <span>Training Run:</span>
          <Select style={{ width: 300 }} placeholder="Select a completed training run"
            value={selectedRun} onChange={setSelectedRun}
            options={completedRuns.map((r) => ({
              value: r.id,
              label: `Run ${r.id.slice(0, 8)}... — ${r.best_map50 ? `mAP50: ${r.best_map50.toFixed(4)}` : "N/A"}`,
            }))} />
          {selectedRun && completedRuns.find((r) => r.id === selectedRun)?.checkpoint_dir && (
            <Button type="primary" icon={<ExportOutlined />} onClick={() => handleExport()} loading={exporting}>
              Export Best Checkpoint
            </Button>
          )}
        </Space>
      </Card>

      {exporting && (
        <Card size="small" title="Export Progress" style={{ marginBottom: 16 }}>
          <LogStreamer lines={logs} />
        </Card>
      )}

      {selectedRun && (
        <>
          <Card title="Checkpoints" size="small" style={{ marginBottom: 16 }}>
            <Table dataSource={checkpoints as unknown as readonly { id: string; [key: string]: unknown }[]} columns={cpColumns} rowKey="id" pagination={false} size="small" />
          </Card>
          <Card title="Exported Models" size="small">
            <Table dataSource={exportedModels as unknown as readonly { id: string; [key: string]: unknown }[]} columns={modelColumns} rowKey="id" pagination={false} size="small" />
          </Card>
        </>
      )}
    </div>
  );
}
