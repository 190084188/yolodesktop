import { useState, useEffect, useCallback } from "react";
import { Card, Button, Table, Tag, Typography, Descriptions, Modal, Radio, Space, Progress, Alert } from "antd";
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined, SyncOutlined, FolderOpenOutlined, ScanOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { openPath } from "@tauri-apps/plugin-opener";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";

interface YoloEnv {
  id: string; version: string; venv_path: string; python_path: string;
  status: string; cuda_available: boolean; installed_at: string | null;
}

interface PrereqCheck {
  python_found: boolean; python_version: string; cuda_available: boolean;
}

interface GpuDiagnostics {
  platform: string;
  cuda_available: boolean;
  driver_version: string | null;
  cuda_version: string | null;
  cudnn_version: string | null;
  gpu_name: string | null;
  vram_mb: number | null;
  conda_cuda_found: boolean;
  conda_cuda_version: string | null;
  conda_cudnn_found: boolean;
  mps_available: boolean;
  issues: string[];
  recommendations: string[];
}

interface ProgressPayload {
  phase: string;
  phaseLabel: string;
  percent: number;
  message: string;
}

const YOLO_VERSIONS = ["8", "11"];

export default function EnvManager() {
  const [installing, setInstalling] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string>("8");
  const [deviceType, setDeviceType] = useState<"cpu" | "gpu">("cpu");
  const [gpuDiag, setGpuDiag] = useState<GpuDiagnostics | null>(null);
  const [gpuDiagLoading, setGpuDiagLoading] = useState(false);
  const [gpuDiagError, setGpuDiagError] = useState<string | null>(null);
  const { t } = useTranslation("env");

  const { data: prereqs, isLoading: prereqLoading } = useInvokeQuery<PrereqCheck>(["prereqs"], "check_prereqs");

  const { data: envs = [], isLoading: envsLoading } = useInvokeQuery<YoloEnv[]>(["envs"], "list_envs");

  const installMutation = useInvokeMutation<string>("install_yolo", {
    invalidateKeys: [["envs"]],
    onSuccess: () => { setInstalling(null); setLogs([]); setProgress(null); },
    onError: () => { setInstalling(null); setProgress(null); },
  });

  const deleteMutation = useInvokeMutation<void>("delete_env", { invalidateKeys: [["envs"]] });

  // Listen for progress events from the Rust backend
  useEffect(() => {
    const unlisten = listen<ProgressPayload>("env:progress", (event) => {
      setProgress(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for log events from the Rust backend
  useEffect(() => {
    const unlisten = listen<string>("env:log", (event) => {
      setLogs((prev) => [...prev, event.payload]);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const openInstallModal = useCallback((version: string) => {
    setSelectedVersion(version);
    setDeviceType("cpu");
    setGpuDiag(null);
    setGpuDiagError(null);
    setInstallModalOpen(true);
  }, []);

  const runGpuDiagnostics = useCallback(async () => {
    setGpuDiagLoading(true);
    setGpuDiagError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<GpuDiagnostics>("check_gpu_diagnostics");
      setGpuDiag(result);
    } catch (e: unknown) {
      setGpuDiagError(String(e));
    } finally {
      setGpuDiagLoading(false);
    }
  }, []);

  const handleConfirmInstall = useCallback(() => {
    setInstallModalOpen(false);
    setInstalling(selectedVersion);
    setLogs([]);
    setProgress(null);
    installMutation.mutate({
      version: selectedVersion,
      device: deviceType === "gpu" ? "cuda" : "cpu",
    });
  }, [selectedVersion, deviceType, installMutation]);

  const handleOpenFolder = useCallback(async (venvPath: string) => {
    try {
      await openPath(venvPath);
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  }, []);

  const phaseLabelMap: Record<string, string> = {
    collecting: t("phaseCollecting"),
    downloading: t("phaseDownloading"),
    installing: t("phaseInstalling"),
    complete: t("phaseComplete"),
  };

  const columns = [
    { title: t("common:version"), dataIndex: "version", key: "version", render: (v: string) => <Tag color="blue">YOLO v{v}</Tag> },
    {
      title: t("common:status"), dataIndex: "status", key: "status",
      render: (s: string) => {
        const color = s === "installed" ? "green" : s === "installing" ? "processing" : "default";
        const icon = s === "installed" ? <CheckCircleOutlined /> : s === "installing" ? <SyncOutlined spin /> : null;
        return <Tag color={color} icon={icon}>{s === "installed" ? t("installed") : s === "installing" ? t("installing") : t("notInstalled")}</Tag>;
      },
    },
    { title: t("cuda"), dataIndex: "cuda_available", key: "cuda", render: (v: boolean) => v ? <Tag color="green">{t("available")}</Tag> : <Tag>{t("cpuOnlyShort")}</Tag> },
    { title: t("installed"), dataIndex: "installed_at", key: "installed_at", render: (v: string | null) => v ?? "—" },
    {
      title: t("common:actions"), key: "actions",
      render: (_: unknown, record: YoloEnv) => (
        <Space>
          <Button size="small" icon={<FolderOpenOutlined />}
            onClick={() => handleOpenFolder(record.venv_path)}
            disabled={record.status !== "installed"}>
            {t("openEnvFolder")}
          </Button>
          <Button danger size="small" icon={<DeleteOutlined />}
            onClick={() => deleteMutation.mutate({ id: record.id })} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={3}>{t("title")}</Typography.Title>

      {!prereqLoading && prereqs && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={3} size="small">
            <Descriptions.Item label={t("python")}>
              {prereqs.python_found ? <Tag color="green">{prereqs.python_version}</Tag> : <Tag color="red">{t("pythonNotFound")}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label={t("cuda")}>
              {prereqs.cuda_available ? <Tag color="green">{t("cudaAvailable")}</Tag> : <Tag>{t("cudaNotAvailable")}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label={t("availableVersions")}>
              {YOLO_VERSIONS.map(v => (
                <Button key={v} size="small" type="primary" icon={<PlusOutlined />}
                  onClick={() => openInstallModal(v)}
                  disabled={installing !== null || envs.some(e => e.version === v && e.status === "installed")}
                  style={{ marginRight: 8 }}>
                  {t("installYolo")} v{v}
                </Button>
              ))}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {installing && (
        <Card size="small" title={t("installYoloV", { version: installing })} style={{ marginBottom: 16 }}>
          {progress && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ marginBottom: 4, fontSize: 13, color: "var(--ant-color-text-secondary)" }}>
                {progress ? phaseLabelMap[progress.phase] || progress.phaseLabel : t("phaseCollecting")}
              </div>
              <Progress percent={progress.percent} size="small" status={progress.percent >= 100 ? "success" : "active"} />
            </div>
          )}
          {!progress && (
            <div style={{ marginBottom: 12, fontSize: 13, color: "var(--ant-color-text-secondary)" }}>
              {t("phaseCollecting")}
            </div>
          )}
          <div style={{
            height: 200, overflow: "auto", background: "#1a1a2e", color: "#e0e0e0",
            fontFamily: "monospace", fontSize: 12, padding: 8, borderRadius: 4,
          }}>
            {logs.length === 0 && <div>{t("phaseCollecting")}</div>}
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </Card>
      )}

      <Card>
        <Table dataSource={envs} columns={columns} rowKey="id" loading={envsLoading} pagination={false} />
      </Card>

      {/* Install configuration modal */}
      <Modal
        title={t("installConfig")}
        open={installModalOpen}
        onCancel={() => setInstallModalOpen(false)}
        onOk={handleConfirmInstall}
        okText={t("installYolo")}
        cancelText={t("common:cancel")}
        width={560}
      >
        <Typography.Title level={5}>{t("selectDevice")}</Typography.Title>
        <Radio.Group
          value={deviceType}
          onChange={(e) => setDeviceType(e.target.value)}
          style={{ marginBottom: 16 }}
        >
          <Space direction="vertical">
            <Radio value="cpu">{t("cpuOnly")}</Radio>
            <Radio value="gpu">
              <Space>
                {t("gpu")}
                <Button
                  size="small"
                  icon={<ScanOutlined />}
                  onClick={runGpuDiagnostics}
                  loading={gpuDiagLoading}
                >
                  {t("gpuDiagnostics")}
                </Button>
              </Space>
            </Radio>
          </Space>
        </Radio.Group>

        {gpuDiag && (
          <Card size="small" title={t("gpuDiagnostics")} style={{ marginBottom: 12 }}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label={t("gpuName")}>
                {gpuDiag.gpu_name ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("driverVersion")}>
                {gpuDiag.driver_version ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("cudaVersion")}>
                {gpuDiag.cuda_version ? <Tag color="green">{gpuDiag.cuda_version}</Tag> : "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("cudnnVersion")}>
                {gpuDiag.cudnn_version ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("vram")}>
                {gpuDiag.vram_mb ? `${gpuDiag.vram_mb} MB` : "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("condaCudaFound")}>
                {gpuDiag.conda_cuda_found ? <Tag color="green">{t("available")}</Tag> : <Tag>{t("cpuOnlyShort")}</Tag>}
              </Descriptions.Item>
            </Descriptions>

            {gpuDiag.issues.length > 0 && (
              <Alert
                type="warning"
                message={t("gpuNotReady")}
                description={gpuDiag.issues.map((issue, i) => <div key={i}>{issue}</div>)}
                style={{ marginBottom: 8 }}
              />
            )}

            {gpuDiag.recommendations.length > 0 && (
              <Alert
                type={gpuDiag.issues.length > 0 ? "info" : "success"}
                message={gpuDiag.issues.length > 0 ? t("installGuide") : t("gpuReady")}
                description={gpuDiag.recommendations.map((rec, i) => <div key={i}>{rec}</div>)}
              />
            )}
          </Card>
        )}

        {gpuDiagError && (
          <Alert type="error" message={t("gpuDiagnostics")} description={gpuDiagError} style={{ marginBottom: 12 }} />
        )}
      </Modal>
    </div>
  );
}
