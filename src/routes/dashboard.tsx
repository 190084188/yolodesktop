import { Card, Col, Row, Statistic, Typography, Table, Tag, Button, Alert } from "antd";
import {
  ExperimentOutlined, DatabaseOutlined, CloudServerOutlined,
  ExportOutlined, ArrowLeftOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInvokeQuery } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeProject } = useWorkspaceStore();
  const { t } = useTranslation(["common", "training"]);

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
    { title: t("common:runId"), dataIndex: "id", key: "id", render: (v: string) => v.slice(0, 8) + "..." },
    {
      title: t("common:status"), dataIndex: "status", key: "status",
      render: (s: string) => {
        const colors: Record<string, string> = {
          running: "processing", completed: "success", stopped: "warning", error: "error",
        };
        return <Tag color={colors[s] || "default"}>{s}</Tag>;
      },
    },
    { title: t("training:bestMap50"), dataIndex: "best_map50", key: "map50", render: (v: number | null) => v?.toFixed(4) ?? "—" },
    { title: t("common:started"), dataIndex: "started_at", key: "started", render: (v: string | null) => v ? new Date(v).toLocaleDateString() : "—" },
    {
      title: "", key: "actions",
      render: (_: unknown, record: { id: string; status: string }) => (
        <Button size="small" onClick={() => navigate(`/train/${record.id}`)}>
          {record.status === "running" ? t("common:monitor") : t("common:view")}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={3}>{t("common:dashboard")}</Typography.Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t("common:installedYoloVersions")} value={installedEnvs}
              prefix={<CloudServerOutlined />}
              suffix={installedEnvs > 0 ? undefined : <Button size="small" type="link" onClick={() => navigate("/env")}>{t("common:install")}</Button>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t("common:datasets")} value={datasets.length}
              prefix={<DatabaseOutlined />}
              suffix={datasets.length === 0 && activeProject ? <Button size="small" type="link" onClick={() => navigate("/datasets")}>{t("common:import")}</Button> : undefined}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t("common:completedRuns")} value={completedRuns}
              prefix={<ExperimentOutlined />}
              suffix={runs.length === 0 && activeProject ? <Button size="small" type="link" onClick={() => navigate("/train")}>{t("common:start")}</Button> : undefined}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t("common:exportedModels")} value={0}
              prefix={<ExportOutlined />}
              suffix={<Button size="small" type="link" onClick={() => navigate("/export")}>{t("common:export")}</Button>}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t("common:recentTrainingRuns")} style={{ marginTop: 16 }}>
        {activeProject ? (
          <Table dataSource={recentRuns} columns={runColumns} rowKey="id" pagination={false} size="small" />
        ) : (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Alert
              message={t("common:selectProjectFirst")}
              description={t("common:selectProjectFirstDesc")}
              type="info"
              showIcon
              style={{ maxWidth: 500, margin: "0 auto 16px" }}
            />
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => {
              const selectEl = document.querySelector(".ant-select-selector") as HTMLElement;
              selectEl?.focus();
            }}>
              {t("common:viewSidebar")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
