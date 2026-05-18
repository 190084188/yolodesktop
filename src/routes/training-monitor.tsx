import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Button, Typography, Space, Tag, Row, Col } from "antd";
import { StopOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import * as echarts from "echarts";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useTrainingStore, type TrainingMetrics } from "../stores/training-store";
import { listen } from "@tauri-apps/api/event";
import LogStreamer from "../components/log-streamer";
import ErrorBanner from "../components/error-banner";

export default function TrainingMonitor() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const { status, metrics, logLines, setActiveRun, setStatus, appendMetrics, appendLog } =
    useTrainingStore();

  useInvokeQuery<Record<string, unknown>>(
    ["training-run", runId ?? ""], "get_training_run", { id: runId ?? "" }, { enabled: !!runId }
  );

  const stopMutation = useInvokeMutation<void>("stop_training", {
    onSuccess: () => setStatus("stopped"),
  });

  useEffect(() => {
    if (runId) setActiveRun(runId);
    return () => { setActiveRun(null); };
  }, [runId]);

  useEffect(() => {
    const unlistenMetrics = listen("training:metrics", (event: any) => {
      const data = event.payload as TrainingMetrics & { type: string };
      if (data.type === "metrics") {
        appendMetrics(data);
        setStatus("running");
      } else if (data.type === "complete") {
        setStatus("completed");
      }
    });

    const unlistenLog = listen("training:log", (event: any) => {
      appendLog(event.payload as string);
    });

    const unlistenError = listen("training:error", (event: any) => {
      appendLog(`ERROR: ${event.payload}`);
    });

    return () => {
      unlistenMetrics.then(fn => fn());
      unlistenLog.then(fn => fn());
      unlistenError.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current = echarts.init(chartRef.current, "dark");
    return () => { chartInstance.current?.dispose(); };
  }, []);

  useEffect(() => {
    if (!chartInstance.current) return;
    const epochs = metrics.map((m) => m.epoch);
    const losses = metrics.map((m) => m.loss);
    const map50s = metrics.map((m) => m.map50 ?? 0);
    const map50_95s = metrics.map((m) => m.map50_95 ?? 0);

    chartInstance.current.setOption({
      tooltip: { trigger: "axis" },
      legend: { data: ["Loss", "mAP50", "mAP50-95"], top: 0, textStyle: { color: "#ccc" } },
      grid: { left: 50, right: 50, top: 40, bottom: 30 },
      xAxis: { type: "category", data: epochs, axisLabel: { color: "#ccc" } },
      yAxis: { type: "value", axisLabel: { color: "#ccc" }, splitLine: { lineStyle: { color: "#333" } } },
      series: [
        { name: "Loss", type: "line", data: losses, smooth: true, symbol: "none", lineStyle: { color: "#ff4d4f" } },
        { name: "mAP50", type: "line", data: map50s, smooth: true, symbol: "none", lineStyle: { color: "#52c41a" } },
        { name: "mAP50-95", type: "line", data: map50_95s, smooth: true, symbol: "none", lineStyle: { color: "#1677ff" } },
      ],
    }, true);
  }, [metrics]);

  const statusColor =
    status === "running" ? "processing" : status === "completed" ? "success"
    : status === "stopped" ? "warning" : status === "error" ? "error" : "default";

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/train")}>Back</Button>
        <Typography.Title level={3} style={{ margin: 0 }}>Training Monitor</Typography.Title>
        <Tag color={statusColor}>{status}</Tag>
      </Space>

      {status === "error" && (
        <ErrorBanner
          message="Training encountered an error"
          suggestion="Check the logs below for details."
          traceback={logLines.filter(l => l.includes("Error") || l.includes("Traceback")).join("\n")}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Training Metrics" size="small">
            <div ref={chartRef} style={{ height: 400 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Latest Metrics" size="small"
            extra={status === "running" && (
              <Button danger size="small" icon={<StopOutlined />}
                onClick={() => runId && stopMutation.mutate({ run_id: runId })}>Stop</Button>
            )}>
            {metrics.length > 0 ? (
              <Space direction="vertical" style={{ width: "100%" }}>
                <div>Epoch: {metrics[metrics.length - 1].epoch}</div>
                <div>Loss: {metrics[metrics.length - 1].loss?.toFixed(4)}</div>
                <div>mAP50: {metrics[metrics.length - 1].map50?.toFixed(4) || "—"}</div>
                <div>mAP50-95: {metrics[metrics.length - 1].map50_95?.toFixed(4) || "—"}</div>
              </Space>
            ) : <Typography.Text type="secondary">Waiting for first epoch...</Typography.Text>}
          </Card>
        </Col>
      </Row>

      <Card title="Training Logs" size="small" style={{ marginTop: 16 }}>
        <LogStreamer lines={logLines} />
      </Card>
    </div>
  );
}
