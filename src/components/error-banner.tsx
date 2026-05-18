import { Alert, Button, Space, Typography } from "antd";
import { CopyOutlined } from "@ant-design/icons";

interface ErrorBannerProps {
  message: string;
  suggestion?: string;
  traceback?: string;
  onApplyFix?: () => void;
}

export default function ErrorBanner({ message, suggestion, traceback, onApplyFix }: ErrorBannerProps) {
  const handleCopy = () => {
    if (traceback) navigator.clipboard.writeText(traceback);
  };

  return (
    <Alert
      type="error"
      message={message}
      description={
        <Space direction="vertical" style={{ width: "100%" }}>
          {suggestion && <Typography.Text>{suggestion}</Typography.Text>}
          <Space>
            {onApplyFix && <Button size="small" type="primary" onClick={onApplyFix}>Apply Fix</Button>}
            {traceback && (
              <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>Copy Details</Button>
            )}
          </Space>
        </Space>
      }
      style={{ marginBottom: 16 }}
      closable
    />
  );
}
