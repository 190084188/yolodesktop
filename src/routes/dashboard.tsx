import { Card, Col, Row, Statistic, Typography, Table, Tag, Button } from "antd";
import {
  ExperimentOutlined, DatabaseOutlined, CloudServerOutlined,
  ExportOutlined, PlusOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useInvokeQuery } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeProject } = useWorkspaceStore();

  const { data: envs = [] } = useInvokeQuery<unknown[]>(["envs"], "list_envs");
  const { data: datasets = [] } = useInvokeQuery<unknown[]>(
    ["datasets", activeProject?.id ?? ""], "list_datasets",
    { project_id: activeProject?.id ?? "" }, { enabled: !!activeProject }
  );
  const { data: runs = [] } = useInvokeQuery<unknown[]>(
    ["training-runs", activeProject?.id ?? ""], "list_training_runs",
    { project_id: activeProject?.id ?? "" }, { enabled: !!activeProject }
  );

  const installedEnvs = (envs as Array<{ status: string }>).filter((e) => e.status === "installed").length;
  const completedRuns = (runs as Array<{ status: string }>).filter((r) => r.status === "completed").length;

  const recentRuns = (runs as Array<{
    id: string; status: string; best_map50: number | null;
    started_at: string | null;
  }>).slice(0, 5);

  const runColumns = [
    { title: "Run ID", dataIndex: "id", key: "id", render: (v: string) => v.slice(0, 8) + "..." },
    {
      title: "Status", dataIndex: "status", key: "status",
      render: (s: string) => {
        const colors: Record<string, string> = {
          running: "processing", completed: "success", stopped: "warning", error: "error",
        };
        return <Tag color={colors[s] || "default"}>{s}</Tag>;
      },
    },
    { title: "Best mAP50", dataIndex: "best_map50", key: "map50", render: (v: number | null) => v?.toFixed(4) ?? "—" },
    { title: "Started", dataIndex: "started_at", key: "started", render: (v: string | null) => v ? new Date(v).toLocaleDateString() : "—" },
    {
      title: "", key: "actions",
      render: (_: unknown, record: { id: string; status: string }) => (
        <Button size="small" onClick={() => navigate(`/train/${record.id}`)}>
          {record.status === "running" ? "Monitor" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={3}>Dashboard</Typography.Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Installed YOLO Versions" value={installedEnvs}
              prefix={<CloudServerOutlined />}
              suffix={installedEnvs > 0 ? undefined : <Button size="small" type="link" onClick={() => navigate("/env")}>Install</Button>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Datasets" value={datasets.length}
              prefix={<DatabaseOutlined />}
              suffix={datasets.length === 0 && activeProject ? <Button size="small" type="link" onClick={() => navigate("/datasets")}>Import</Button> : undefined}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Completed Runs" value={completedRuns}
              prefix={<ExperimentOutlined />}
              suffix={runs.length === 0 && activeProject ? <Button size="small" type="link" onClick={() => navigate("/train")}>Start</Button> : undefined}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Exported Models" value={0}
              prefix={<ExportOutlined />}
              suffix={<Button size="small" type="link" onClick={() => navigate("/export")}>Export</Button>}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Recent Training Runs" style={{ marginTop: 16 }}>
        {activeProject ? (
          <Table dataSource={recentRuns} columns={runColumns} rowKey="id" pagination={false} size="small" />
        ) : (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Typography.Text type="secondary">Select or create a project to get started</Typography.Text>
            <br />
            <Button type="primary" icon={<PlusOutlined />} style={{ marginTop: 16 }}>Create Project</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
