import { Select, Button, Space, Typography } from "antd";
import { ScanOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useInvokeQuery } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";

export interface ModelInfo {
  filename: string;
  path: string;
  size_bytes: number;
  modified_at: number;
}

interface ModelSelectorProps {
  value?: string;
  onChange?: (value: string) => void;
}

export default function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const { t } = useTranslation("training");
  const { activeProject } = useWorkspaceStore();

  const { data: models = [], isLoading, refetch } = useInvokeQuery<ModelInfo[]>(
    ["scan-models", activeProject?.id ?? ""],
    "scan_models",
    { projectId: activeProject?.id ?? "", extraPaths: "" },
    { enabled: true }
  );

  const options = models.map((m) => ({
    value: m.filename,
    label: `${m.filename} (${(m.size_bytes / 1024 / 1024).toFixed(1)} MB)`,
  }));

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space>
        <Select
          style={{ width: 250 }}
          placeholder={t("selectModel")}
          value={value}
          onChange={onChange}
          options={options}
          loading={isLoading}
          notFoundContent={t("noModelInstalled")}
          allowClear
          showSearch
        />
        <Button icon={<ScanOutlined />} loading={isLoading} onClick={() => refetch()}>
          {t("scanModels")}
        </Button>
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t("modelManualInput")}
      </Typography.Text>
    </Space>
  );
}
