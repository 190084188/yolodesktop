import { useParams, useNavigate } from "react-router-dom";
import { Card, Descriptions, Tag, Table, Button, Typography, Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useInvokeQuery } from "../hooks/use-invoke";
import { FORMAT_LABELS, FORMAT_COLORS } from "../lib/format-converters";

interface DatasetDetailData {
  id: string; project_id: string; name: string; format: string;
  image_count: number; class_count: number; classes_json: string;
  path: string; imported_at: string;
}

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: dataset, isLoading } = useInvokeQuery<DatasetDetailData>(
    ["dataset", id ?? ""], "get_dataset", { id: id ?? "" }, { enabled: !!id }
  );

  if (isLoading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;
  if (!dataset) return <Typography.Text type="danger">Dataset not found</Typography.Text>;

  let classNames: string[] = [];
  try { classNames = JSON.parse(dataset.classes_json); } catch { /* ignore */ }

  const classColumns = [
    { title: "#", key: "index", render: (_: unknown, __: unknown, i: number) => i + 1 },
    { title: "Class Name", dataIndex: "name", key: "name" },
  ];

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/datasets")} style={{ marginBottom: 16 }}>
        Back to Datasets
      </Button>
      <Typography.Title level={3}>{dataset.name}</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={3}>
          <Descriptions.Item label="Format"><Tag color={FORMAT_COLORS[dataset.format]}>{FORMAT_LABELS[dataset.format]}</Tag></Descriptions.Item>
          <Descriptions.Item label="Images">{dataset.image_count}</Descriptions.Item>
          <Descriptions.Item label="Classes">{dataset.class_count}</Descriptions.Item>
          <Descriptions.Item label="Path">{dataset.path}</Descriptions.Item>
          <Descriptions.Item label="Imported">{new Date(dataset.imported_at).toLocaleString()}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Classes">
        <Table dataSource={classNames.map((name) => ({ name }))} columns={classColumns} rowKey="name" pagination={false} size="small" />
      </Card>
    </div>
  );
}
