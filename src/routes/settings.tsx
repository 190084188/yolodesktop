import { useEffect } from "react";
import { Card, Form, Input, Button, Switch, Typography, Divider, App } from "antd";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";

export default function Settings() {
  const { t } = useTranslation(["settings", "common"]);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  // Load dataset settings on mount
  useEffect(() => {
    (async () => {
      const keys = [
        "dataset_root_dir", "extra_model_paths",
        "kaggle_username", "kaggle_key",
        "huggingface_token", "roboflow_key",
      ];
      const values: Record<string, string> = {};
      for (const k of keys) {
        try {
          const v = await invoke<string | null>("get_dataset_setting", { key: k });
          if (v) values[k] = v;
        } catch { /* setting not found, leave empty */ }
      }
      form.setFieldsValue({
        datasetRootDir: values.dataset_root_dir || "",
        extraModelPaths: values.extra_model_paths || "",
        kaggleUsername: values.kaggle_username || "",
        kaggleKey: values.kaggle_key || "",
        huggingfaceToken: values.huggingface_token || "",
        roboflowKey: values.roboflow_key || "",
      });
    })();
  }, [form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    const settings: [string, string][] = [
      ["dataset_root_dir", (values.datasetRootDir || "") as string],
      ["extra_model_paths", (values.extraModelPaths || "") as string],
      ["kaggle_username", (values.kaggleUsername || "") as string],
      ["kaggle_key", (values.kaggleKey || "") as string],
      ["huggingface_token", (values.huggingfaceToken || "") as string],
      ["roboflow_key", (values.roboflowKey || "") as string],
    ];
    for (const [key, value] of settings) {
      await invoke("set_dataset_setting", { key, value });
    }
    message.success(t("settingsSaved"));
  };

  const handleTestConnection = async (source: string) => {
    try {
      const result = await invoke<Record<string, { online: boolean }>>("check_connectivity");
      const status = result?.[source]?.online;
      if (status) {
        message.success(`${source}: ${t("common:testConnection")} OK`);
      } else {
        message.warning(`${source}: ${t("connectivityOffline")}`);
      }
    } catch {
      message.error(t("common:error"));
    }
  };

  return (
    <div>
      <Typography.Title level={3}>{t("title")}</Typography.Title>
      <Card style={{ maxWidth: 600 }}>
        <Form layout="vertical" form={form}>
          {/* --- General settings --- */}
          <Form.Item label={t("workspaceDir")} help={t("workspaceDirHelp")}>
            <Input placeholder={t("workspaceDirPlaceholder")} />
          </Form.Item>
          <Form.Item label={t("pythonPath")} help={t("pythonPathHelp")}>
            <Input placeholder={t("pythonPathPlaceholder")} />
          </Form.Item>
          <Divider />
          <Form.Item label={t("autoStartTensorboard")}>
            <Switch />
          </Form.Item>
          <Form.Item label={t("checkUpdates")}>
            <Switch defaultChecked />
          </Form.Item>

          {/* --- Dataset settings --- */}
          <Divider />
          <Typography.Title level={5}>{t("datasetSettings")}</Typography.Title>
          <Form.Item name="datasetRootDir" label={t("datasetRootDir")} help={t("datasetRootDirHelp")}>
            <Input placeholder={t("workspaceDirPlaceholder")} />
          </Form.Item>
          <Form.Item name="extraModelPaths" label={t("extraModelPaths")}>
            <Input placeholder={t("extraModelPathsPlaceholder")} />
          </Form.Item>

          {/* --- API Keys --- */}
          <Divider />
          <Typography.Title level={5}>{t("apiKeys")}</Typography.Title>
          <Form.Item name="kaggleUsername" label={t("kaggleUsername")}>
            <Input placeholder="Kaggle username" />
          </Form.Item>
          <Form.Item name="kaggleKey" label={t("kaggleKey")}>
            <Input.Password placeholder="Kaggle API key" />
          </Form.Item>
          <Button size="small" onClick={() => handleTestConnection("kaggle")} style={{ marginBottom: 12 }}>
            {t("common:testConnection")} (Kaggle)
          </Button>

          <Form.Item name="huggingfaceToken" label={t("huggingfaceToken")}>
            <Input.Password placeholder="hf_..." />
          </Form.Item>
          <Button size="small" onClick={() => handleTestConnection("huggingface")} style={{ marginBottom: 12 }}>
            {t("common:testConnection")} (HuggingFace)
          </Button>

          <Form.Item name="roboflowKey" label={t("roboflowKey")}>
            <Input.Password placeholder="Roboflow API key" />
          </Form.Item>
          <Button size="small" onClick={() => handleTestConnection("roboflow")} style={{ marginBottom: 12 }}>
            {t("common:testConnection")} (Roboflow)
          </Button>

          <Divider />
          <Button type="primary" htmlType="submit" onClick={handleSave}>
            {t("saveSettings")}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
