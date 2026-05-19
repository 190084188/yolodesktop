import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Button, Table, Tag, Typography, Modal, Input, Space, Alert,
  Tabs, Checkbox, Row, Col, Drawer, List
} from "antd";
import {
  PlusOutlined, DeleteOutlined, EyeOutlined,
  SearchOutlined, ReloadOutlined, FileTextOutlined,
  CopyOutlined, DownloadOutlined,
} from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useDownloadStore } from "../stores/download-store";
import { FORMAT_LABELS, FORMAT_COLORS } from "../lib/format-converters";
import LogStreamer from "../components/log-streamer";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import mdContent from "../../docs/dataset-formats.md?raw";

interface Dataset {
  id: string; project_id: string; name: string; format: string;
  image_count: number; class_count: number; classes_json: string;
  path: string; imported_at: string;
}

function ConnectivityDot({ online }: { online: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      backgroundColor: online ? "#52c41a" : "#ff4d4f", marginRight: 4,
    }} />
  );
}

function SearchResultItem({
  item, source, t,
}: {
  item: Record<string, unknown>; source: string;
  t: (key: string) => string;
}) {
  const name = (item.title || item.name || item.id || item.ref || "?") as string;
  const desc = (item.description || item.subtitle || item.summary || "") as string;
  const url = (item.url || item.link || item.html_url || item.ref || "") as string;

  return (
    <Card size="small" style={{ marginBottom: 8 }}>
      <Typography.Text strong ellipsis>{name}</Typography.Text>
      <Tag style={{ marginLeft: 8 }}>{source}</Tag>
      {desc ? <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: "4px 0" }} ellipsis={{ rows: 2 }}>{desc}</Typography.Paragraph> : null}
      <Space style={{ marginTop: 4 }}>
        <Button size="small" icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(url)}>
          {t("common:copyLink")}
        </Button>
        <Button size="small" icon={<DownloadOutlined />} onClick={() => {
          useDownloadStore.getState().addTask({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: name,
            source: source,
            url: url,
            progress: 0, speedMbps: 0, etaSeconds: 0,
            status: "pending",
          });
          useDownloadStore.getState().setDrawerOpen(true);
        }}>
          {t("common:download")}
        </Button>
      </Space>
    </Card>
  );
}

function SearchResultColumn({
  data, isLoading, isError, source, t,
}: {
  data: unknown; isLoading: boolean; isError: boolean;
  source: string; t: (key: string) => string;
}) {
  if (isLoading) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <Typography.Text type="secondary">{t("common:loading")}</Typography.Text>
    </div>
  );

  if (isError) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <Typography.Text type="danger">{t("sourceError")}</Typography.Text>
    </div>
  );

  const results = Array.isArray(data) ? data as Record<string, unknown>[]
    : ((data as Record<string, unknown>)?.results || (data as Record<string, unknown>)?.items || []) as Record<string, unknown>[];

  if (results.length === 0) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <Typography.Text type="secondary">{t("noResults")}</Typography.Text>
    </div>
  );

  return (
    <List
      dataSource={results}
      renderItem={(item: Record<string, unknown>) => (
        <SearchResultItem item={item} source={source} t={t} />
      )}
    />
  );
}

export default function DatasetList() {
  const navigate = useNavigate();
  const { activeProject } = useWorkspaceStore();
  const { t } = useTranslation(["dataset", "common"]);

  // --- Local tab state ---
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  // --- Search tab state ---
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchSources, setSearchSources] = useState<string[]>(["kaggle", "huggingface", "roboflow"]);
  const [committedKeyword, setCommittedKeyword] = useState("");
  const [searchTrigger, setSearchTrigger] = useState(0);

  // --- Format spec drawer ---
  const [formatSpecOpen, setFormatSpecOpen] = useState(false);

  // --- Queries: local datasets ---
  const { data: datasets = [], isLoading } = useInvokeQuery<Dataset[]>(
    ["datasets", activeProject?.id ?? ""], "list_datasets",
    { project_id: activeProject?.id ?? "" }, { enabled: !!activeProject }
  );

  const { data: datasetRoot } = useInvokeQuery<string | null>(
    ["dataset-setting", "dataset_root_dir"], "get_dataset_setting",
    { key: "dataset_root_dir" }
  );

  // --- Queries: scanned datasets ---
  const rootPath = datasetRoot ?? "";
  const { data: scannedDatasets = [], isLoading: scanning } = useInvokeQuery<Record<string, unknown>[]>(
    ["scanned-datasets", rootPath, String(scanCount)],
    "scan_dataset_folders",
    { rootPath },
    { enabled: scanCount > 0 && !!rootPath }
  );

  // --- Queries: connectivity ---
  const { data: connectivity } = useInvokeQuery<Record<string, { online: boolean }>>(
    ["connectivity"], "check_connectivity"
  );

  // --- Queries: search (one per source) ---
  const kaggleEnabled = !!committedKeyword && searchSources.includes("kaggle");
  const hfEnabled = !!committedKeyword && searchSources.includes("huggingface");
  const rfEnabled = !!committedKeyword && searchSources.includes("roboflow");

  const { data: kaggleData, isLoading: kaggleLoading, isError: kaggleError } = useInvokeQuery<unknown>(
    ["kaggle-search", committedKeyword, String(searchTrigger)],
    "search_kaggle", { keyword: committedKeyword },
    { enabled: kaggleEnabled }
  );
  const { data: hfData, isLoading: hfLoading, isError: hfError } = useInvokeQuery<unknown>(
    ["huggingface-search", committedKeyword, String(searchTrigger)],
    "search_huggingface", { keyword: committedKeyword },
    { enabled: hfEnabled }
  );
  const { data: rfData, isLoading: rfLoading, isError: rfError } = useInvokeQuery<unknown>(
    ["roboflow-search", committedKeyword, String(searchTrigger)],
    "search_roboflow", { keyword: committedKeyword },
    { enabled: rfEnabled }
  );

  // --- Mutations ---
  const importMutation = useInvokeMutation<string>("import_dataset", {
    invalidateKeys: [["datasets", activeProject?.id ?? ""]],
    onSuccess: () => {
      setImporting(false); setImportModalOpen(false); setImportName(""); setImportPath("");
    },
    onError: () => setImporting(false),
  });

  const deleteMutation = useInvokeMutation<void>("delete_dataset", {
    invalidateKeys: [["datasets", activeProject?.id ?? ""]],
  });

  // --- Handlers ---
  const handleImport = () => {
    if (!activeProject || !importPath) return;
    setImporting(true);
    setImportLogs([]);
    importMutation.mutate({
      project_id: activeProject.id,
      name: importName || importPath.split(/[/\\]/).pop() || "dataset",
      source_path: importPath,
    });
  };

  const handleSearch = () => {
    const kw = searchKeyword.trim();
    if (kw) {
      setCommittedKeyword(kw);
      setSearchTrigger((c) => c + 1);
    }
  };

  const handleSourceChange = (checkedValues: string[]) => {
    setSearchSources(checkedValues);
  };

  // --- Table columns ---
  const columns = [
    { title: t("common:name"), dataIndex: "name", key: "name" },
    {
      title: t("common:format"), dataIndex: "format", key: "format",
      render: (f: string) => <Tag color={FORMAT_COLORS[f] || "default"}>{FORMAT_LABELS[f] || f}</Tag>,
    },
    { title: t("common:images"), dataIndex: "image_count", key: "image_count" },
    { title: t("common:classes"), dataIndex: "class_count", key: "class_count" },
    {
      title: t("imported"), dataIndex: "imported_at", key: "imported_at",
      render: (v: string) => v ? new Date(v).toLocaleDateString() : "—",
    },
    {
      title: t("common:actions"), key: "actions",
      render: (_: unknown, record: Dataset) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/datasets/${record.id}`)}>
            {t("common:view")}
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />}
            onClick={() => deleteMutation.mutate({ id: record.id })} />
        </Space>
      ),
    },
  ];

  // --- Search source options ---
  const sourceOptions = [
    { label: t("sourceKaggle"), value: "kaggle" },
    { label: t("sourceHuggingFace"), value: "huggingface" },
    { label: t("sourceRoboflow"), value: "roboflow" },
  ];

  // --- Tab items ---
  const tabItems = [
    {
      key: "local",
      label: t("localDatasets"),
      children: (
        <div>
          {!activeProject && <Alert message={t("common:selectProjectFirst")} type="info" style={{ marginBottom: 16 }} />}
          <Card>
            <Table dataSource={datasets} columns={columns} rowKey="id" loading={isLoading} pagination={false} />
          </Card>
          {scannedDatasets.length > 0 && (
            <Card title={t("scanFolders")} style={{ marginTop: 16 }}>
              <List
                dataSource={scannedDatasets}
                renderItem={(item: Record<string, unknown>) => (
                  <List.Item
                    actions={[
                      <Button key="import" size="small" icon={<PlusOutlined />}
                        onClick={() => {
                          setImportPath((item.path || "") as string);
                          setImportName((item.name || "") as string);
                          setImportModalOpen(true);
                        }}>
                        {t("common:import")}
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={(item.name || item.path || "?") as string}
                      description={`${t("common:format")}: ${item.format || "?"} · ${t("common:images")}: ${item.image_count ?? "?"} · ${t("common:classes")}: ${item.class_count ?? "?"}`}
                    />
                  </List.Item>
                )}
              />
            </Card>
          )}
        </div>
      ),
    },
    {
      key: "search",
      label: t("searchDatasets"),
      children: (
        <div>
          <Space direction="vertical" style={{ width: "100%", marginBottom: 16 }}>
            <Input.Search
              placeholder={t("searchPlaceholder")}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onSearch={handleSearch}
              enterButton={<SearchOutlined />}
              style={{ maxWidth: 500 }}
            />
            <Space>
              <Checkbox.Group options={sourceOptions} value={searchSources} onChange={handleSourceChange} />
              <Typography.Text style={{ fontSize: 12 }}>
                {t("connectivityCheck")}:
              </Typography.Text>
              {(["kaggle", "huggingface", "roboflow"] as const).map((src) => (
                <span key={src} style={{ fontSize: 12 }}>
                  <ConnectivityDot online={connectivity?.[src]?.online ?? false} />
                  {t(`source${src.charAt(0).toUpperCase() + src.slice(1)}` as never)}
                </span>
              ))}
            </Space>
          </Space>

          {!committedKeyword ? (
            <div style={{ textAlign: "center", padding: 60 }}>
              <Typography.Text type="secondary">{t("searchPlaceholder")}</Typography.Text>
            </div>
          ) : (
            <Row gutter={16}>
              {searchSources.includes("kaggle") && (
                <Col span={searchSources.length === 1 ? 24 : searchSources.length === 2 ? 12 : 8}>
                  <Card title={t("sourceKaggle")} size="small">
                    <SearchResultColumn
                      data={kaggleData} isLoading={kaggleLoading} isError={!!kaggleError}
                      source="Kaggle" t={t}
                    />
                  </Card>
                </Col>
              )}
              {searchSources.includes("huggingface") && (
                <Col span={searchSources.length === 1 ? 24 : searchSources.length === 2 ? 12 : 8}>
                  <Card title={t("sourceHuggingFace")} size="small">
                    <SearchResultColumn
                      data={hfData} isLoading={hfLoading} isError={!!hfError}
                      source="HuggingFace" t={t}
                    />
                  </Card>
                </Col>
              )}
              {searchSources.includes("roboflow") && (
                <Col span={searchSources.length === 1 ? 24 : searchSources.length === 2 ? 12 : 8}>
                  <Card title={t("sourceRoboflow")} size="small">
                    <SearchResultColumn
                      data={rfData} isLoading={rfLoading} isError={!!rfError}
                      source="Roboflow" t={t}
                    />
                  </Card>
                </Col>
              )}
            </Row>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{t("title")}</Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} loading={scanning}
            disabled={!rootPath}
            onClick={() => { if (rootPath) setScanCount((c) => c + 1); }}>
            {t("refreshList")}
          </Button>
          <Button icon={<FileTextOutlined />} onClick={() => setFormatSpecOpen(true)}>
            {t("formatSpec")}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setImportModalOpen(true)} disabled={!activeProject}>
            {t("importDataset")}
          </Button>
        </Space>
      </div>

      <Tabs items={tabItems} />

      {/* Import Modal */}
      <Modal title={t("importDataset")} open={importModalOpen} onOk={handleImport}
        onCancel={() => setImportModalOpen(false)} confirmLoading={importing}
        okText={t("common:import")}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder={t("importNamePlaceholder")} value={importName}
            onChange={(e) => setImportName(e.target.value)} />
          <Input placeholder={t("importPathPlaceholder")} value={importPath}
            onChange={(e) => setImportPath(e.target.value)} />
          {importing && <LogStreamer lines={importLogs} />}
        </Space>
      </Modal>

      {/* Format Spec Drawer */}
      <Drawer
        title={t("formatSpec")}
        open={formatSpecOpen}
        onClose={() => setFormatSpecOpen(false)}
        placement="right"
        width={700}
      >
        <div style={{ fontSize: 14, lineHeight: 1.8 }}>
          <ReactMarkdown>
            {mdContent || "# Format Specification\n\nDocumentation not available."}
          </ReactMarkdown>
        </div>
      </Drawer>
    </div>
  );
}
