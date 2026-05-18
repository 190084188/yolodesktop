import { Drawer, Descriptions, Tag } from "antd";

interface DetailPanelProps {
  open: boolean;
  node: {
    id: string;
    label: string;
    node_type: string;
    params: Record<string, unknown>;
  } | null;
  onClose: () => void;
}

export default function DetailPanel({ open, node, onClose }: DetailPanelProps) {
  if (!node) return null;

  return (
    <Drawer title={node.label} open={open} onClose={onClose} width={400}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="ID">{node.id}</Descriptions.Item>
        <Descriptions.Item label="Type">
          <Tag color="blue">{node.node_type}</Tag>
        </Descriptions.Item>
        {node.params && Object.entries(node.params).map(([key, value]) => (
          <Descriptions.Item key={key} label={key}>
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </Drawer>
  );
}
