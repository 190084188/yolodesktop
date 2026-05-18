import { Modal, Progress, Button, Space } from "antd";

interface ProgressOverlayProps {
  open: boolean;
  title: string;
  percent?: number;
  status?: "active" | "success" | "exception";
  message?: string;
  onCancel?: () => void;
  cancelText?: string;
}

export default function ProgressOverlay({
  open,
  title,
  percent = 0,
  status = "active",
  message,
  onCancel,
  cancelText = "Cancel",
}: ProgressOverlayProps) {
  return (
    <Modal
      open={open}
      title={title}
      footer={null}
      closable={false}
      maskClosable={false}
    >
      <Progress percent={percent} status={status} />
      {message && <p style={{ marginTop: 12 }}>{message}</p>}
      {onCancel && (
        <Space style={{ marginTop: 16, justifyContent: "flex-end", width: "100%" }}>
          <Button danger onClick={onCancel}>{cancelText}</Button>
        </Space>
      )}
    </Modal>
  );
}
