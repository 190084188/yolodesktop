import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Form, Select, Button, Typography, InputNumber, Space, Collapse,
  Modal, Input, Tag, Row, Col, Switch, Divider,
} from "antd";
import {
  PlayCircleOutlined, ReloadOutlined, ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import debounce from "lodash.debounce";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";
import YamlEditor from "../components/yaml-editor";
import ModelSelector from "../components/model-selector";
import ParamTooltip, { PARAM_DEFS } from "../components/param-tooltip";

const DEFAULT_CONFIG = `# YOLO Training Config
path: ./
train: images/train
val: images/val

names:
  0: class_name

# Training parameters
epochs: 100
batch: 16
imgsz: 640
device: cuda:0
workers: 8
optimizer: AdamW
lr0: 0.001
lrf: 0.01
momentum: 0.937
weight_decay: 0.0005
warmup_epochs: 3
warmup_momentum: 0.8
warmup_bias_lr: 0.1

# Augmentation
hsv_h: 0.015
hsv_s: 0.7
hsv_v: 0.4
degrees: 0.0
translate: 0.1
scale: 0.5
shear: 0.0
perspective: 0.0
flipud: 0.0
fliplr: 0.5
mosaic: 1.0
mixup: 0.0
`;

function parseYamlParams(yaml: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(\w+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2].trim();
    if (rawValue === "" || rawValue === "~") {
      params[key] = "";
    } else if (rawValue === "true") {
      params[key] = true;
    } else if (rawValue === "false") {
      params[key] = false;
    } else {
      const num = Number(rawValue);
      params[key] = isNaN(num) ? rawValue : num;
    }
  }
  return params;
}

function updateYamlParam(yaml: string, key: string, value: unknown): string {
  const lines = yaml.split("\n");
  const regex = new RegExp(`^(\\s*)${key}:\\s*.*$`);
  let found = false;
  const result = lines.map((line) => {
    if (regex.test(line)) {
      found = true;
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      return `${indent}${key}: ${value}`;
    }
    return line;
  });
  if (!found) {
    result.push(`${key}: ${value}`);
  }
  return result.join("\n");
}

function getNum(v: unknown, def: number): number {
  return typeof v === "number" ? v : def;
}

function getStr(v: unknown, def: string): string {
  return typeof v === "string" ? v : def;
}

// Full parameter definitions for the modal
interface ParamDef {
  key: string;
  labelKey: string;
  type: "number" | "string" | "select" | "boolean";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue: unknown;
}

const FULL_PARAM_CATEGORIES: { category: string; params: ParamDef[] }[] = [
  {
    category: "Training",
    params: [
      { key: "epochs", labelKey: "epochs", type: "number", min: 1, max: 10000, step: 1, defaultValue: 100 },
      { key: "batch", labelKey: "batch", type: "number", min: 1, max: 512, step: 1, defaultValue: 16 },
      { key: "imgsz", labelKey: "imgsz", type: "number", min: 32, max: 2560, step: 32, defaultValue: 640 },
      { key: "device", labelKey: "device", type: "string", defaultValue: "cuda:0" },
      { key: "workers", labelKey: "workers", type: "number", min: 0, max: 32, step: 1, defaultValue: 8 },
      { key: "patience", labelKey: "patience", type: "number", min: 0, max: 1000, step: 1, defaultValue: 100 },
      { key: "save_period", labelKey: "save_period", type: "number", min: -1, max: 1000, step: 1, defaultValue: -1 },
      { key: "cos_lr", labelKey: "cos_lr", type: "boolean", defaultValue: false },
      { key: "close_mosaic", labelKey: "close_mosaic", type: "number", min: 0, max: 100, step: 1, defaultValue: 15 },
      { key: "amp", labelKey: "amp", type: "boolean", defaultValue: true },
      { key: "seed", labelKey: "seed", type: "number", min: 0, step: 1, defaultValue: 0 },
      { key: "deterministic", labelKey: "deterministic", type: "boolean", defaultValue: true },
      { key: "single_cls", labelKey: "single_cls", type: "boolean", defaultValue: false },
      { key: "rect", labelKey: "rect", type: "boolean", defaultValue: false },
      { key: "resume", labelKey: "resume", type: "boolean", defaultValue: false },
      { key: "fraction", labelKey: "fraction", type: "number", min: 0.0, max: 1.0, step: 0.1, defaultValue: 1.0 },
      { key: "freeze", labelKey: "freeze", type: "number", min: 0, max: 100, step: 1, defaultValue: 0 },
      { key: "multi_scale", labelKey: "multi_scale", type: "boolean", defaultValue: false },
      { key: "save", labelKey: "save", type: "boolean", defaultValue: true },
      { key: "exist_ok", labelKey: "exist_ok", type: "boolean", defaultValue: false },
    ],
  },
  {
    category: "Optimization",
    params: [
      { key: "optimizer", labelKey: "optimizer", type: "select",
        options: [
          { value: "SGD", label: "SGD" },
          { value: "Adam", label: "Adam" },
          { value: "AdamW", label: "AdamW" },
          { value: "RMSProp", label: "RMSProp" },
        ],
        defaultValue: "AdamW" },
      { key: "lr0", labelKey: "lr0", type: "number", min: 0.00001, max: 0.1, step: 0.0001, defaultValue: 0.001 },
      { key: "lrf", labelKey: "lrf", type: "number", min: 0.001, max: 1.0, step: 0.001, defaultValue: 0.01 },
      { key: "momentum", labelKey: "momentum", type: "number", min: 0.0, max: 1.0, step: 0.001, defaultValue: 0.937 },
      { key: "weight_decay", labelKey: "weightDecay", type: "number", min: 0.0, max: 0.01, step: 0.0001, defaultValue: 0.0005 },
      { key: "warmup_epochs", labelKey: "warmupEpochs", type: "number", min: 0, max: 50, step: 1, defaultValue: 3 },
      { key: "warmup_momentum", labelKey: "warmupMomentum", type: "number", min: 0.0, max: 1.0, step: 0.01, defaultValue: 0.8 },
      { key: "warmup_bias_lr", labelKey: "warmup_bias_lr", type: "number", min: 0.0, max: 0.1, step: 0.001, defaultValue: 0.1 },
      { key: "box", labelKey: "box_loss_weight", type: "number", min: 0.0, max: 20.0, step: 0.1, defaultValue: 7.5 },
      { key: "cls", labelKey: "cls_loss_weight", type: "number", min: 0.0, max: 10.0, step: 0.1, defaultValue: 0.5 },
      { key: "dfl", labelKey: "dfl_loss_weight", type: "number", min: 0.0, max: 10.0, step: 0.1, defaultValue: 1.5 },
      { key: "label_smoothing", labelKey: "label_smoothing", type: "number", min: 0.0, max: 0.2, step: 0.01, defaultValue: 0.0 },
      { key: "nbs", labelKey: "nbs", type: "number", min: 1, max: 256, step: 1, defaultValue: 64 },
    ],
  },
  {
    category: "Augmentation",
    params: [
      { key: "hsv_h", labelKey: "hsvH", type: "number", min: 0.0, max: 0.5, step: 0.001, defaultValue: 0.015 },
      { key: "hsv_s", labelKey: "hsvS", type: "number", min: 0.0, max: 1.0, step: 0.01, defaultValue: 0.7 },
      { key: "hsv_v", labelKey: "hsvV", type: "number", min: 0.0, max: 1.0, step: 0.01, defaultValue: 0.4 },
      { key: "degrees", labelKey: "degrees", type: "number", min: 0.0, max: 180.0, step: 0.5, defaultValue: 0.0 },
      { key: "translate", labelKey: "translate", type: "number", min: 0.0, max: 0.9, step: 0.01, defaultValue: 0.1 },
      { key: "scale", labelKey: "scale", type: "number", min: 0.0, max: 0.9, step: 0.01, defaultValue: 0.5 },
      { key: "shear", labelKey: "shear", type: "number", min: 0.0, max: 45.0, step: 0.1, defaultValue: 0.0 },
      { key: "perspective", labelKey: "perspective", type: "number", min: 0.0, max: 0.001, step: 0.0001, defaultValue: 0.0 },
      { key: "flipud", labelKey: "flipud", type: "number", min: 0.0, max: 1.0, step: 0.1, defaultValue: 0.0 },
      { key: "fliplr", labelKey: "fliplr", type: "number", min: 0.0, max: 1.0, step: 0.1, defaultValue: 0.5 },
      { key: "mosaic", labelKey: "mosaic", type: "number", min: 0.0, max: 1.0, step: 0.1, defaultValue: 1.0 },
      { key: "mixup", labelKey: "mixup", type: "number", min: 0.0, max: 1.0, step: 0.1, defaultValue: 0.0 },
      { key: "copy_paste", labelKey: "copy_paste", type: "number", min: 0.0, max: 1.0, step: 0.1, defaultValue: 0.0 },
      { key: "erasing", labelKey: "erasing", type: "number", min: 0.0, max: 0.4, step: 0.1, defaultValue: 0.4 },
      { key: "crop_fraction", labelKey: "crop_fraction", type: "number", min: 0.1, max: 1.0, step: 0.05, defaultValue: 1.0 },
    ],
  },
];

// Load extra labels not in the training namespace
const EXTRA_LABELS: Record<string, string> = {
  seed: "Random Seed",
  deterministic: "Deterministic",
  single_cls: "Single Class",
  rect: "Rectangular Training",
  resume: "Resume Training",
  fraction: "Data Fraction",
  freeze: "Freeze Layers",
  multi_scale: "Multi-Scale",
  save: "Save Checkpoints",
  exist_ok: "Overwrite Output",
  box_loss_weight: "Box Loss Weight",
  cls_loss_weight: "Cls Loss Weight",
  dfl_loss_weight: "DFL Loss Weight",
  label_smoothing: "Label Smoothing",
  nbs: "Nominal Batch Size",
  shear: "Shear",
  perspective: "Perspective",
  copy_paste: "Copy-Paste",
  erasing: "Random Erasing",
  crop_fraction: "Crop Fraction",
  warmup_bias_lr: "Warmup Bias LR",
};

const DEVICE_OPTIONS = [
  { value: "cpu", label: "CPU" },
  { value: "cuda:0", label: "GPU 0 (cuda:0)" },
  { value: "0", label: "GPU 0" },
  { value: "0,1", label: "GPU 0,1" },
  { value: "0,1,2", label: "GPU 0,1,2" },
  { value: "0,1,2,3", label: "GPU 0,1,2,3" },
];

const OPTIMIZER_OPTIONS = [
  { value: "SGD", label: "SGD" },
  { value: "Adam", label: "Adam" },
  { value: "AdamW", label: "AdamW" },
  { value: "RMSProp", label: "RMSProp" },
];

export default function TrainingSetup() {
  const navigate = useNavigate();
  const { activeProject } = useWorkspaceStore();
  const [yamlContent, setYamlContent] = useState(DEFAULT_CONFIG);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<string>();
  const [selectedDataset, setSelectedDataset] = useState<string>();
  const [fullParamsModalOpen, setFullParamsModalOpen] = useState(false);
  const [fullParamsSearch, setFullParamsSearch] = useState("");
  const [formParams, setFormParams] = useState<Record<string, unknown>>(() =>
    parseYamlParams(DEFAULT_CONFIG)
  );
  // Track whether a YAML edit is being debounced to prevent form→YAML feedback loop
  const debounceActiveRef = useRef(false);
  const { t } = useTranslation(["training", "common"]);

  const { data: envs = [] } = useInvokeQuery<Array<{ id: string; version: string; status: string }>>(["envs"], "list_envs");
  const { data: datasets = [] } = useInvokeQuery<Array<{ id: string; name: string }>>(
    ["datasets", activeProject?.id ?? ""], "list_datasets",
    { project_id: activeProject?.id ?? "" }, { enabled: !!activeProject }
  );

  const startMutation = useInvokeMutation<string>("start_training", {
    invalidateKeys: [["training-runs", activeProject?.id ?? ""]],
    onSuccess: (runId) => { navigate(`/train/${runId}`); },
  });

  const handleFormParamChange = useCallback((key: string, value: unknown) => {
    if (debounceActiveRef.current) return; // skip while YAML edit is being debounced
    setFormParams((prev) => {
      const next = { ...prev, [key]: value };
      // Update YAML immediately from form change
      const newYaml = updateYamlParam(yamlContent, key, value);
      setYamlContent(newYaml);
      return next;
    });
  }, [yamlContent]);

  // Debounced YAML parsing: YAML editor → parse → update form
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedParseRef = useRef(
    debounce((yaml: string) => {
      try {
        const parsed = parseYamlParams(yaml);
        const numericCount = Object.values(parsed).filter(
          (v) => typeof v === "number"
        ).length;
        if (numericCount < 2) {
          // Too few parsed values suggests malformed YAML
          setYamlError(t("yamlInvalid"));
          debounceActiveRef.current = false;
          return;
        }
        setYamlError(null);
        setFormParams((prev) => {
          const merged: Record<string, unknown> = { ...prev };
          for (const key of Object.keys(parsed)) {
            merged[key] = parsed[key];
          }
          return merged;
        });
      } catch {
        setYamlError(t("yamlInvalid"));
      }
      debounceActiveRef.current = false;
    }, 500)
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedParseRef.current.cancel();
    };
  }, []);

  const handleYamlChange = useCallback(
    (newYaml: string) => {
      setYamlContent(newYaml);
      setYamlError(null);
      debounceActiveRef.current = true;
      debouncedParseRef.current(newYaml);
    },
    [debouncedParseRef]
  );

  const handleYamlBlur = useCallback(() => {
    // Force parse immediately on blur
    debouncedParseRef.current.cancel();
    debounceActiveRef.current = true;
    try {
      const parsed = parseYamlParams(yamlContent);
      const numericCount = Object.values(parsed).filter(
        (v) => typeof v === "number"
      ).length;
      if (numericCount < 2) {
        setYamlError(t("yamlInvalid"));
        debounceActiveRef.current = false;
        return;
      }
      setYamlError(null);
      setFormParams((prev) => {
        const merged: Record<string, unknown> = { ...prev };
        for (const key of Object.keys(parsed)) {
          merged[key] = parsed[key];
        }
        return merged;
      });
    } catch {
      setYamlError(t("yamlInvalid"));
    }
    debounceActiveRef.current = false;
  }, [yamlContent, t, debouncedParseRef]);

  const handleRestoreDefaults = useCallback(() => {
    setYamlContent(DEFAULT_CONFIG);
    setYamlError(null);
    setFormParams(parseYamlParams(DEFAULT_CONFIG));
  }, []);

  const confirmRestoreDefaults = useCallback(() => {
    Modal.confirm({
      title: t("restoreDefaults"),
      content: t("restoreDefaultsConfirm"),
      icon: <ExclamationCircleOutlined />,
      onOk: handleRestoreDefaults,
    });
  }, [t, handleRestoreDefaults]);

  const handleStart = () => {
    if (!activeProject || !selectedEnv || !selectedDataset) return;
    startMutation.mutate({
      project_id: activeProject.id,
      dataset_id: selectedDataset,
      env_id: selectedEnv,
      config_yaml: yamlContent,
      model: getStr(formParams["model"], "yolov8n.pt"),
    });
  };

  const handleFullParamChange = (key: string, value: unknown) => {
    handleFormParamChange(key, value);
  };

  // Filter full params by search
  const filterFullParams = (categories: typeof FULL_PARAM_CATEGORIES) => {
    if (!fullParamsSearch.trim()) return categories;
    const query = fullParamsSearch.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        params: cat.params.filter(
          (p) =>
            p.key.toLowerCase().includes(query) ||
            (PARAM_DEFS[p.key] ?? "").toLowerCase().includes(query) ||
            (EXTRA_LABELS[p.labelKey] ?? "").toLowerCase().includes(query)
        ),
      }))
      .filter((cat) => cat.params.length > 0);
  };

  const getParamValue = (key: string, def: unknown): unknown => {
    return key in formParams ? formParams[key] : def;
  };

  const renderFullParamInput = (param: ParamDef) => {
    const value = getParamValue(param.key, param.defaultValue);
    switch (param.type) {
      case "number":
        return (
          <InputNumber
            style={{ width: 140 }}
            value={getNum(value, Number(param.defaultValue))}
            onChange={(v) => handleFullParamChange(param.key, v ?? param.defaultValue)}
            min={param.min}
            max={param.max}
            step={param.step}
            size="small"
          />
        );
      case "select":
        return (
          <Select
            style={{ width: 140 }}
            value={getStr(value, String(param.defaultValue))}
            onChange={(v) => handleFullParamChange(param.key, v)}
            options={param.options}
            size="small"
          />
        );
      case "string":
        return (
          <Input
            style={{ width: 140 }}
            value={getStr(value, String(param.defaultValue))}
            onChange={(e) => handleFullParamChange(param.key, e.target.value)}
            size="small"
          />
        );
      case "boolean":
        return (
          <Switch
            checked={Boolean(value)}
            onChange={(v) => handleFullParamChange(param.key, v)}
            size="small"
          />
        );
      default:
        return null;
    }
  };

  const params = formParams;
  const epochs = getNum(params["epochs"], 100);
  const batch = getNum(params["batch"], 16);
  const imgsz = getNum(params["imgsz"], 640);
  const device = getStr(params["device"], "cuda:0");
  const workers = getNum(params["workers"], 8);
  const optimizer = getStr(params["optimizer"], "AdamW");
  const lr0 = getNum(params["lr0"], 0.001);
  const lrf = getNum(params["lrf"], 0.01);
  const momentum = getNum(params["momentum"], 0.937);
  const weightDecay = getNum(params["weight_decay"], 0.0005);
  const warmupEpochs = getNum(params["warmup_epochs"], 3);
  const hsvH = getNum(params["hsv_h"], 0.015);
  const hsvS = getNum(params["hsv_s"], 0.7);
  const hsvV = getNum(params["hsv_v"], 0.4);
  const degrees = getNum(params["degrees"], 0);
  const translate = getNum(params["translate"], 0.1);
  const scale = getNum(params["scale"], 0.5);
  const mosaic = getNum(params["mosaic"], 1.0);
  const mixup = getNum(params["mixup"], 0.0);
  const fliplr = getNum(params["fliplr"], 0.5);

  return (
    <div>
      <Typography.Title level={3}>{t("setup")}</Typography.Title>

      <Space direction="vertical" style={{ width: "100%" }} size="large">
        {/* Configuration Preset */}
        <Card title={t("configPreset")} size="small">
          <Form layout="vertical">
            <Row gutter={[24, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t("yoloEnvironment")}>
                  <Select
                    style={{ width: "100%" }}
                    placeholder={t("selectEnv")}
                    value={selectedEnv}
                    onChange={setSelectedEnv}
                    options={(envs as Array<{ id: string; version: string; status: string }>)
                      .filter((e) => e.status === "installed")
                      .map((e) => ({ value: e.id, label: `YOLO v${e.version}` }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t("dataset")}>
                  <Select
                    style={{ width: "100%" }}
                    placeholder={t("selectDataset")}
                    value={selectedDataset}
                    onChange={setSelectedDataset}
                    options={(datasets as Array<{ id: string; name: string }>).map((d) => ({
                      value: d.id,
                      label: d.name,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t("baseModel")}>
                  <ModelSelector
                    value={getStr(params["model"], "")}
                    onChange={(v) => handleFormParamChange("model", v)}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>

        {/* Basic Parameters */}
        <Card title={t("basicParams")} size="small">
          <Form layout="vertical">
            <Row gutter={[16, 0]}>
              <Col xs={12} sm={8} md={4}>
                <Form.Item label={<ParamTooltip label={t("epochs")} tooltip={PARAM_DEFS.epochs ?? ""} />}>
                  <InputNumber
                    style={{ width: "100%" }}
                    min={1} max={10000}
                    value={epochs}
                    onChange={(v) => handleFormParamChange("epochs", v ?? 100)}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Form.Item label={<ParamTooltip label={t("batch")} tooltip={PARAM_DEFS.batch ?? ""} />}>
                  <InputNumber
                    style={{ width: "100%" }}
                    min={1} max={512}
                    value={batch}
                    onChange={(v) => handleFormParamChange("batch", v ?? 16)}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Form.Item label={<ParamTooltip label={t("imgsz")} tooltip={PARAM_DEFS.imgsz ?? ""} />}>
                  <InputNumber
                    style={{ width: "100%" }}
                    min={32} max={2560} step={32}
                    value={imgsz}
                    onChange={(v) => handleFormParamChange("imgsz", v ?? 640)}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Form.Item label={<ParamTooltip label={t("device")} tooltip={PARAM_DEFS.device ?? ""} />}>
                  <Select
                    style={{ width: "100%" }}
                    value={device}
                    onChange={(v) => handleFormParamChange("device", v)}
                    options={DEVICE_OPTIONS}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Form.Item label={<ParamTooltip label={t("workers")} tooltip={PARAM_DEFS.workers ?? ""} />}>
                  <InputNumber
                    style={{ width: "100%" }}
                    min={0} max={32}
                    value={workers}
                    onChange={(v) => handleFormParamChange("workers", v ?? 8)}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>

        {/* Advanced Parameters */}
        <Collapse
          items={[
            {
              key: "advanced",
              label: t("advancedParams"),
              children: (
                <Form layout="vertical">
                  <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                    {t("optimizer")}
                  </Typography.Text>
                  <Row gutter={[16, 0]}>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("optimizer")} tooltip={PARAM_DEFS.optimizer ?? ""} />}>
                        <Select
                          style={{ width: "100%" }}
                          value={optimizer}
                          onChange={(v) => handleFormParamChange("optimizer", v)}
                          options={OPTIMIZER_OPTIONS}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("lr0")} tooltip={PARAM_DEFS.lr0 ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0.00001} max={0.1} step={0.0001}
                          value={lr0}
                          onChange={(v) => handleFormParamChange("lr0", v ?? 0.001)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("lrf")} tooltip={PARAM_DEFS.lrf ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0.001} max={1.0} step={0.001}
                          value={lrf}
                          onChange={(v) => handleFormParamChange("lrf", v ?? 0.01)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("momentum")} tooltip={PARAM_DEFS.momentum ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={1} step={0.001}
                          value={momentum}
                          onChange={(v) => handleFormParamChange("momentum", v ?? 0.937)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("weightDecay")} tooltip={PARAM_DEFS.weight_decay ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={0.01} step={0.0001}
                          value={weightDecay}
                          onChange={(v) => handleFormParamChange("weight_decay", v ?? 0.0005)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("warmupEpochs")} tooltip={PARAM_DEFS.warmup_epochs ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={50}
                          value={warmupEpochs}
                          onChange={(v) => handleFormParamChange("warmup_epochs", v ?? 3)}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Divider style={{ margin: "12px 0" }} />
                  <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                    {t("augmentation")}
                  </Typography.Text>
                  <Row gutter={[16, 0]}>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("hsvH")} tooltip={PARAM_DEFS.hsv_h ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={0.5} step={0.001}
                          value={hsvH}
                          onChange={(v) => handleFormParamChange("hsv_h", v ?? 0.015)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("hsvS")} tooltip={PARAM_DEFS.hsv_s ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={1.0} step={0.01}
                          value={hsvS}
                          onChange={(v) => handleFormParamChange("hsv_s", v ?? 0.7)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("hsvV")} tooltip={PARAM_DEFS.hsv_v ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={1.0} step={0.01}
                          value={hsvV}
                          onChange={(v) => handleFormParamChange("hsv_v", v ?? 0.4)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("degrees")} tooltip={PARAM_DEFS.degrees ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={180} step={0.5}
                          value={degrees}
                          onChange={(v) => handleFormParamChange("degrees", v ?? 0)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("translate")} tooltip={PARAM_DEFS.translate ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={0.9} step={0.01}
                          value={translate}
                          onChange={(v) => handleFormParamChange("translate", v ?? 0.1)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("scale")} tooltip={PARAM_DEFS.scale ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={0.9} step={0.01}
                          value={scale}
                          onChange={(v) => handleFormParamChange("scale", v ?? 0.5)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("mosaic")} tooltip={PARAM_DEFS.mosaic ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={1.0} step={0.1}
                          value={mosaic}
                          onChange={(v) => handleFormParamChange("mosaic", v ?? 1.0)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("mixup")} tooltip={PARAM_DEFS.mixup ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={1.0} step={0.1}
                          value={mixup}
                          onChange={(v) => handleFormParamChange("mixup", v ?? 0.0)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8} md={4}>
                      <Form.Item label={<ParamTooltip label={t("fliplr")} tooltip={PARAM_DEFS.fliplr ?? ""} />}>
                        <InputNumber
                          style={{ width: "100%" }}
                          min={0} max={1.0} step={0.1}
                          value={fliplr}
                          onChange={(v) => handleFormParamChange("fliplr", v ?? 0.5)}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              ),
            },
          ]}
          style={{ marginBottom: 0 }}
        />

        {/* YAML Editor */}
        <Card
          title={
            <Space>
              <span>{t("configYaml")}</span>
              {yamlError && <Tag color="error">{yamlError}</Tag>}
            </Space>
          }
          size="small"
          extra={
            <Space>
              <Button icon={<ReloadOutlined />} size="small" onClick={confirmRestoreDefaults}>
                {t("restoreDefaults")}
              </Button>
              <Button size="small" onClick={() => setFullParamsModalOpen(true)}>
                {t("fullParams")}
              </Button>
            </Space>
          }
        >
          <div
            style={{
              border: `1px solid ${yamlError ? "#ff4d4f" : "#434343"}`,
              borderRadius: 4,
              transition: "border-color 0.3s",
            }}
          >
            <YamlEditor
              value={yamlContent}
              onChange={handleYamlChange}
              height="350px"
            />
          </div>
          {/* We add an invisible input to capture blur events from the CodeMirror editor */}
          <div style={{ height: 0, overflow: "hidden" }}>
            <input
              aria-label="yaml-blur-capture"
              onFocus={() => {}}
              onBlur={handleYamlBlur}
              style={{ height: 0, width: 0, border: "none", padding: 0 }}
            />
          </div>
        </Card>

        {/* Full Parameters Modal */}
        <Modal
          title={t("fullParams")}
          open={fullParamsModalOpen}
          onCancel={() => setFullParamsModalOpen(false)}
          onOk={() => setFullParamsModalOpen(false)}
          width={900}
          styles={{ body: { maxHeight: "60vh", overflow: "auto" } }}
        >
          <Input.Search
            placeholder={t("searchParams")}
            value={fullParamsSearch}
            onChange={(e) => setFullParamsSearch(e.target.value)}
            allowClear
            style={{ marginBottom: 16 }}
          />
          {filterFullParams(FULL_PARAM_CATEGORIES).map((cat) => (
            <div key={cat.category} style={{ marginBottom: 16 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>
                {cat.category}
              </Typography.Text>
              <Row gutter={[12, 8]} style={{ marginTop: 8 }}>
                {cat.params.map((param) => (
                  <Col key={param.key} xs={24} sm={12} md={8} lg={6}>
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                      <ParamTooltip
                        label={EXTRA_LABELS[param.labelKey] || t(param.labelKey as any) || param.key}
                        tooltip={PARAM_DEFS[param.key] ?? ""}
                      />
                      {renderFullParamInput(param)}
                    </Space>
                  </Col>
                ))}
              </Row>
            </div>
          ))}
          {filterFullParams(FULL_PARAM_CATEGORIES).length === 0 && (
            <Typography.Text type="secondary">{t("common:noData")}</Typography.Text>
          )}
        </Modal>

        {/* Start Button */}
        <Button
          type="primary"
          size="large"
          icon={<PlayCircleOutlined />}
          onClick={handleStart}
          loading={startMutation.isPending}
          disabled={!selectedEnv || !selectedDataset || !activeProject}
          block
        >
          {t("startTraining")}
        </Button>
      </Space>
    </div>
  );
}
