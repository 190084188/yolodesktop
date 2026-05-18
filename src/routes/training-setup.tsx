import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Form, Select, Button, Typography, InputNumber, Space } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";
import YamlEditor from "../components/yaml-editor";

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

export default function TrainingSetup() {
  const navigate = useNavigate();
  const { activeProject } = useWorkspaceStore();
  const [yamlContent, setYamlContent] = useState(DEFAULT_CONFIG);
  const [selectedEnv, setSelectedEnv] = useState<string>();
  const [selectedDataset, setSelectedDataset] = useState<string>();
  const [selectedModel, setSelectedModel] = useState("yolov8n.pt");

  const { data: envs = [] } = useInvokeQuery<Array<{ id: string; version: string; status: string }>>(["envs"], "list_envs");
  const { data: datasets = [] } = useInvokeQuery<Array<{ id: string; name: string }>>(
    ["datasets", activeProject?.id ?? ""], "list_datasets",
    { project_id: activeProject?.id ?? "" }, { enabled: !!activeProject }
  );

  const startMutation = useInvokeMutation<string>("start_training", {
    invalidateKeys: [["training-runs", activeProject?.id ?? ""]],
    onSuccess: (runId) => { navigate(`/train/${runId}`); },
  });

  const handleStart = () => {
    if (!activeProject || !selectedEnv || !selectedDataset) return;
    startMutation.mutate({
      project_id: activeProject.id,
      dataset_id: selectedDataset,
      env_id: selectedEnv,
      config_yaml: yamlContent,
      model: selectedModel,
    });
  };

  return (
    <div>
      <Typography.Title level={3}>Training Setup</Typography.Title>

      <Space direction="vertical" style={{ width: "100%" }} size="large">
        <Card title="Configuration Preset" size="small">
          <Form layout="inline">
            <Form.Item label="YOLO Environment">
              <Select style={{ width: 200 }} placeholder="Select env" value={selectedEnv} onChange={setSelectedEnv}
                options={(envs as Array<{ id: string; version: string; status: string }>).filter(e => e.status === "installed").map(e => ({ value: e.id, label: `YOLO v${e.version}` }))} />
            </Form.Item>
            <Form.Item label="Dataset">
              <Select style={{ width: 200 }} placeholder="Select dataset" value={selectedDataset} onChange={setSelectedDataset}
                options={(datasets as Array<{ id: string; name: string }>).map(d => ({ value: d.id, label: d.name }))} />
            </Form.Item>
            <Form.Item label="Base Model">
              <Select style={{ width: 180 }} value={selectedModel} onChange={setSelectedModel}
                options={[
                  { value: "yolov8n.pt", label: "YOLOv8 Nano" },
                  { value: "yolov8s.pt", label: "YOLOv8 Small" },
                  { value: "yolov8m.pt", label: "YOLOv8 Medium" },
                  { value: "yolov8l.pt", label: "YOLOv8 Large" },
                  { value: "yolov8x.pt", label: "YOLOv8 XLarge" },
                  { value: "yolo11n.pt", label: "YOLO11 Nano" },
                  { value: "yolo11s.pt", label: "YOLO11 Small" },
                  { value: "yolo11m.pt", label: "YOLO11 Medium" },
                  { value: "yolo11l.pt", label: "YOLO11 Large" },
                  { value: "yolo11x.pt", label: "YOLO11 XLarge" },
                ]} />
            </Form.Item>
          </Form>
        </Card>

        <Card title="Quick Parameters">
          <Form layout="vertical">
            <Space wrap>
              <Form.Item label="Epochs"><InputNumber min={1} max={1000} defaultValue={100} /></Form.Item>
              <Form.Item label="Batch Size"><InputNumber min={1} max={128} defaultValue={16} /></Form.Item>
              <Form.Item label="Image Size"><InputNumber min={320} max={1280} step={32} defaultValue={640} /></Form.Item>
              <Form.Item label="Learning Rate"><InputNumber min={0.0001} max={0.1} step={0.0001} defaultValue={0.001} /></Form.Item>
            </Space>
          </Form>
        </Card>

        <Card title="Advanced Config (YAML)">
          <YamlEditor value={yamlContent} onChange={setYamlContent} height="350px" />
        </Card>

        <Button type="primary" size="large" icon={<PlayCircleOutlined />} onClick={handleStart}
          loading={startMutation.isPending} disabled={!selectedEnv || !selectedDataset || !activeProject}>
          Start Training
        </Button>
      </Space>
    </div>
  );
}
