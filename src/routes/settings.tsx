import { Card, Form, Input, Button, Switch, Typography, Divider } from "antd";
import { useTranslation } from "react-i18next";

export default function Settings() {
  const { t } = useTranslation(["settings", "common"]);

  return (
    <div>
      <Typography.Title level={3}>{t("title")}</Typography.Title>
      <Card style={{ maxWidth: 600 }}>
        <Form layout="vertical">
          <Form.Item label={t("workspaceDir")} help="Base directory for projects and data">
            <Input placeholder="~/yolodesktop-workspace" />
          </Form.Item>
          <Form.Item label={t("pythonPath")} help="Override system Python detection">
            <Input placeholder="Auto-detected" />
          </Form.Item>
          <Divider />
          <Form.Item label={t("autoStartTensorboard")}>
            <Switch />
          </Form.Item>
          <Form.Item label={t("checkUpdates")}>
            <Switch defaultChecked />
          </Form.Item>
          <Button type="primary" htmlType="submit">{t("saveSettings")}</Button>
        </Form>
      </Card>
    </div>
  );
}
