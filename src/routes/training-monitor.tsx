import { useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Button, Typography, Space, Tag, Row, Col, Statistic } from "antd";
import { StopOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import * as echarts from "echarts";
import { useTranslation } from "react-i18next";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useTrainingStore, type TrainingMetrics, type GpuStats } from "../stores/training-store";
import { listen } from "@tauri-apps/api/event";
import LogStreamer from "../components/log-streamer";
import ErrorBanner from "../components/error-banner";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function TrainingMonitor() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const {
    status,
    metrics,
    logLines,
    gpuStats,
    bestMap50,
    bestEpoch,
    totalEpochs,
    trainingStartTime,
    setActiveRun,
    setStatus,
    appendMetrics,
    appendLog,
    setGpuStats,
    setBestMap50,
    setBestEpoch,
  } = useTrainingStore();
  const { t } = useTranslation(["training", "common"]);

  useInvokeQuery<Record<string, unknown>>(
    ["training-run", runId ?? ""],
    "get_training_run",
    { id: runId ?? "" },
    { enabled: !!runId }
  );

  const stopMutation = useInvokeMutation<void>("stop_training", {
    onSuccess: () => setStatus("stopped"),
  });

  useEffect(() => {
    if (runId) setActiveRun(runId);
    return () => { setActiveRun(null); };
  }, [runId]);

  // Listen for training events including GPU stats
  useEffect(() => {
    const unlistenMetrics = listen("training:metrics", (event: any) => {
      const data = event.payload as TrainingMetrics & { type: string; best_epoch?: number; best_map50?: number };
      if (data.type === "metrics") {
        appendMetrics(data);
        setStatus("running");
      } else if (data.type === "complete") {
        setStatus("completed");
        if (typeof data.best_map50 === "number") {
          setBestMap50(data.best_map50 as number);
        }
        if (typeof data.best_epoch === "number") {
          setBestEpoch(data.best_epoch as number);
        }
      } else if (data.type === "gpu-stats") {
        setGpuStats(data as unknown as GpuStats);
      }
    });

    const unlistenLog = listen("training:log", (event: any) => {
      appendLog(event.payload as string);
    });

    const unlistenError = listen("training:error", (event: any) => {
      appendLog(`ERROR: ${event.payload}`);
    });

    return () => {
      unlistenMetrics.then((fn) => fn());
      unlistenLog.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, []);

  // Init ECharts instance
  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current = echarts.init(chartRef.current, "dark");
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chartInstance.current?.dispose();
    };
  }, []);

  // Compute estimated remaining time
  const estimatedRemaining = useMemo(() => {
    if (metrics.length === 0 || !trainingStartTime || status !== "running") return null;
    const currentEpoch = metrics[metrics.length - 1].epoch;
    if (currentEpoch <= 1) return null;
    const elapsed = (Date.now() - trainingStartTime) / 1000; // seconds
    const timePerEpoch = elapsed / currentEpoch;
    const remaining = timePerEpoch * (totalEpochs - currentEpoch);
    return formatDuration(remaining);
  }, [metrics, trainingStartTime, status, totalEpochs]);

  // Update chart with all series including precision/recall
  useEffect(() => {
    if (!chartInstance.current) return;
    const epochs = metrics.map((m) => m.epoch);
    const losses = metrics.map((m) => m.loss);
    const map50s = metrics.map((m) => m.map50 ?? 0);
    const map50_95s = metrics.map((m) => m.map50_95 ?? 0);
    const precisions = metrics.map((m) => m.precision ?? 0);
    const recalls = metrics.map((m) => m.recall ?? 0);

    // Build markLine for best epoch
    const markLines: Record<string, unknown>[] = [];
    if (status === "completed" && bestEpoch !== null && bestEpoch !== undefined) {
      markLines.push({
        silent: true,
        symbol: "pin",
        symbolSize: 40,
        label: {
          formatter: `Best: Epoch ${bestEpoch}`,
          fontSize: 12,
          color: "#faad14",
        },
        lineStyle: { color: "#faad14", type: "dashed" as const },
        data: [{ xAxis: bestEpoch, yAxis: "max" }],
      });
    }

    chartInstance.current.setOption(
      {
        tooltip: {
          trigger: "axis",
          formatter: (params: { seriesName: string; value: number; marker: string; axisValueLabel: string }[]) => {
            let html = `<strong>Epoch ${params[0]?.axisValueLabel ?? ""}</strong><br/>`;
            for (const p of params) {
              html += `${p.marker} ${p.seriesName}: ${p.value?.toFixed?.(6) ?? p.value}<br/>`;
            }
            return html;
          },
        },
        legend: {
          data: [
            t("loss"),
            `mAP50`,
            `mAP50-95`,
            t("precision"),
            t("recall"),
          ],
          top: 0,
          textStyle: { color: "#ccc" },
          selected: {
            [t("precision")]: true,
            [t("recall")]: true,
            [t("loss")]: true,
            [`mAP50`]: true,
            [`mAP50-95`]: true,
          },
        },
        grid: { left: 55, right: 55, top: 50, bottom: 65 },
        xAxis: {
          name: t("epoch"),
          type: "category" as const,
          data: epochs,
          axisLabel: { color: "#ccc" },
          nameTextStyle: { color: "#ccc" },
        },
        yAxis: {
          type: "value" as const,
          axisLabel: { color: "#ccc" },
          splitLine: { lineStyle: { color: "#333" } },
        },
        dataZoom: [
          {
            type: "slider" as const,
            start: 0,
            end: 100,
            height: 20,
            bottom: 0,
            borderColor: "#444",
            backgroundColor: "#1a1a2e",
            dataBackground: {
              lineStyle: { color: "#888" },
              areaStyle: { color: "rgba(136,136,136,0.15)" },
            },
            selectedDataBackground: {
              lineStyle: { color: "#1677ff" },
              areaStyle: { color: "rgba(22,119,255,0.2)" },
            },
            textStyle: { color: "#ccc" },
          },
        ],
        series: [
          {
            name: t("loss"),
            type: "line",
            data: losses,
            smooth: true,
            symbol: "none",
            lineStyle: { color: "#ff4d4f" },
            markLine:
              status === "completed" && bestEpoch !== null
                ? {
                    silent: true,
                    symbol: "diamond",
                    label: {
                      formatter: `Best @ Ep ${bestEpoch}`,
                      color: "#faad14",
                    },
                    lineStyle: { color: "#faad14", type: "dashed" },
                    data: [{ xAxis: bestEpoch }],
                  }
                : undefined,
          },
          {
            name: "mAP50",
            type: "line",
            data: map50s,
            smooth: true,
            symbol: "none",
            lineStyle: { color: "#52c41a" },
          },
          {
            name: "mAP50-95",
            type: "line",
            data: map50_95s,
            smooth: true,
            symbol: "none",
            lineStyle: { color: "#1677ff" },
          },
          {
            name: t("precision"),
            type: "line",
            data: precisions,
            smooth: true,
            symbol: "none",
            lineStyle: { color: "#faad14", type: "dashed" },
          },
          {
            name: t("recall"),
            type: "line",
            data: recalls,
            smooth: true,
            symbol: "none",
            lineStyle: { color: "#722ed1", type: "dashed" },
          },
        ],
      },
      true
    );
  }, [metrics, status, bestEpoch, t]);

  const statusColor =
    status === "running"
      ? "processing"
      : status === "completed"
        ? "success"
        : status === "stopped"
          ? "warning"
          : status === "error"
            ? "error"
            : "default";

  const currentEpoch = metrics.length > 0 ? metrics[metrics.length - 1].epoch : 0;
  const latestMetrics = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/train")}>
          {t("common:back")}
        </Button>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t("monitor")}
        </Typography.Title>
        <Tag color={statusColor}>{status}</Tag>
      </Space>

      {status === "error" && (
        <ErrorBanner
          message={t("common:trainingEncounteredError")}
          suggestion={t("common:checkLogsBelow")}
          traceback={logLines
            .filter((l) => l.includes("Error") || l.includes("Traceback"))
            .join("\n")}
        />
      )}

      {/* Stat Cards Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title={t("epoch")} value={currentEpoch} suffix={`/ ${totalEpochs}`} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title={t("bestMap50")}
              value={bestMap50 > 0 ? bestMap50.toFixed(4) : "—"}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title={t("gpuUtilization")}
              value={gpuStats ? `${gpuStats.utilization_pct.toFixed(1)}%` : "—"}
              valueStyle={{
                color:
                  gpuStats && gpuStats.utilization_pct > 80
                    ? "#ff4d4f"
                    : gpuStats
                      ? "#52c41a"
                      : undefined,
              }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title={t("vramUsage")}
              value={
                gpuStats && gpuStats.memory_total_mb > 0
                  ? `${(gpuStats.memory_used_mb / 1024).toFixed(1)} GB`
                  : "—"
              }
              suffix={
                gpuStats && gpuStats.memory_total_mb > 0
                  ? `/ ${(gpuStats.memory_total_mb / 1024).toFixed(1)} GB`
                  : undefined
              }
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title={t("estimatedRemaining")}
              value={estimatedRemaining ?? "—"}
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Chart and Latest Metrics */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title={t("metrics")} size="small">
            <div ref={chartRef} style={{ height: 400 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title={t("latestMetrics")}
            size="small"
            extra={
              status === "running" && (
                <Button
                  danger
                  size="small"
                  icon={<StopOutlined />}
                  onClick={() => runId && stopMutation.mutate({ run_id: runId })}
                >
                  {t("common:stop")}
                </Button>
              )
            }
          >
            {latestMetrics ? (
              <Space direction="vertical" style={{ width: "100%" }}>
                <div>
                  {t("epoch")}: {latestMetrics.epoch}
                </div>
                <div>
                  {t("loss")}: {latestMetrics.loss?.toFixed(4)}
                </div>
                <div>
                  {t("map50")}: {latestMetrics.map50?.toFixed(4) || "—"}
                </div>
                <div>
                  {t("map50_95")}: {latestMetrics.map50_95?.toFixed(4) || "—"}
                </div>
                <div>
                  {t("precision")}: {latestMetrics.precision?.toFixed(4) || "—"}
                </div>
                <div>
                  {t("recall")}: {latestMetrics.recall?.toFixed(4) || "—"}
                </div>
              </Space>
            ) : (
              <Typography.Text type="secondary">
                {t("waitingForEpoch")}
              </Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* Log Streamer */}
      <Card title={t("trainingLogs")} size="small" style={{ marginTop: 16 }}>
        <LogStreamer lines={logLines} />
      </Card>
    </div>
  );
}
