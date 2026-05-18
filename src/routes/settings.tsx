import { Card, Form, Input, Button, Switch, Typography, Divider } from "antd";

export default function Settings() {
  return (
    <div>
      <Typography.Title level={3}>Settings</Typography.Title>
      <Card style={{ maxWidth: 600 }}>
        <Form layout="vertical">
          <Form.Item label="Workspace Directory" help="Base directory for projects and data">
            <Input placeholder="~/yolodesktop-workspace" />
          </Form.Item>
          <Form.Item label="Python Path" help="Override system Python detection">
            <Input placeholder="Auto-detected" />
          </Form.Item>
          <Divider />
          <Form.Item label="Auto-start TensorBoard">
            <Switch />
          </Form.Item>
          <Form.Item label="Check for updates on startup">
            <Switch defaultChecked />
          </Form.Item>
          <Button type="primary" htmlType="submit">Save Settings</Button>
        </Form>
      </Card>
    </div>
  );
}
