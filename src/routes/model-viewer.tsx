import { useState } from "react";
import { Card, Button, Typography, Space, Alert } from "antd";
import { ApartmentOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useInvokeMutation } from "../hooks/use-invoke";
import YamlEditor from "../components/yaml-editor";
import ModelGraph from "../components/model-graph";

const SAMPLE_YAML = `# YOLOv8 model backbone
backbone:
  - [-1, 1, Conv, [64, 3, 2]]
  - [-1, 1, Conv, [128, 3, 2]]
  - [-1, 3, C2f, [128, True]]
  - [-1, 1, Conv, [256, 3, 2]]
  - [-1, 6, C2f, [256, True]]
  - [-1, 1, Conv, [512, 3, 2]]
  - [-1, 6, C2f, [512, True]]
  - [-1, 1, Conv, [1024, 3, 2]]
  - [-1, 3, C2f, [1024, True]]
  - [-1, 1, SPPF, [1024, 5]]

head:
  - [-1, 1, nn.Upsample, [None, 2, 'nearest']]
  - [[-1, 6], 1, Concat, [1]]
  - [-1, 3, C2f, [512]]
  - [-1, 1, nn.Upsample, [None, 2, 'nearest']]
  - [[-1, 4], 1, Concat, [1]]
  - [-1, 3, C2f, [256]]
  - [-1, 1, Conv, [256, 3, 2]]
  - [[-1, 12], 1, Concat, [1]]
  - [-1, 3, C2f, [512]]
  - [-1, 1, Conv, [512, 3, 2]]
  - [[-1, 9], 1, Concat, [1]]
  - [-1, 3, C2f, [1024]]
  - [[15, 18, 21], 1, Detect, [nc]]
`;

interface GraphNode {
  id: string; label: string; node_type: string;
  params: Record<string, unknown>; position: { x: number; y: number };
}

export default function ModelViewer() {
  const [yamlInput, setYamlInput] = useState(SAMPLE_YAML);
  const [graphData, setGraphData] = useState<{ nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> } | null>(null);
  const { t } = useTranslation("common");

  const parseMutation = useInvokeMutation<{ nodes: GraphNode[]; edges: Array<{ id: string; from: string; to: string }> }>("parse_model_config");

  const handleParse = () => {
    parseMutation.mutate(
      { yaml_content: yamlInput },
      {
        onSuccess: (data) => {
          setGraphData({
            nodes: data.nodes.map((n) => ({
              id: n.id, type: "custom",
              data: { label: n.label, nodeType: n.node_type, params: n.params },
              position: n.position,
            })),
            edges: data.edges.map((e) => ({
              id: e.id, source: e.from, target: e.to,
            })),
          });
        },
      }
    );
  };

  return (
    <div>
      <Typography.Title level={3}><ApartmentOutlined /> {t("modelGraph")}</Typography.Title>
      <Alert message="Paste a YOLO model YAML configuration to visualize the architecture." type="info" style={{ marginBottom: 16 }} />

      <Space direction="vertical" style={{ width: "100%" }} size="large">
        <Card title="Model YAML Input" size="small">
          <YamlEditor value={yamlInput} onChange={setYamlInput} height="300px" />
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleParse}
            loading={parseMutation.isPending} style={{ marginTop: 12 }}>
            Parse & Visualize
          </Button>
        </Card>

        {graphData && (
          <Card title="Model Architecture" size="small">
            <ModelGraph nodes={graphData.nodes as never[]} edges={graphData.edges as never[]} />
          </Card>
        )}
      </Space>
    </div>
  );
}
