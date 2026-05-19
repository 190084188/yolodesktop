import { Drawer, List, Progress, Button, Tag, Typography, Space } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { useDownloadStore } from "../stores/download-store";
import { useTranslation } from "react-i18next";

export default function DownloadQueue() {
  const { tasks, drawerOpen, setDrawerOpen } = useDownloadStore();
  const { t } = useTranslation("dataset");

  const statusColor: Record<string, string> = {
    pending: "default", downloading: "processing", completed: "success",
    failed: "error", cancelled: "warning",
  };

  return (
    <Drawer
      title={t("downloadDataset")}
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      placement="right"
      width={400}
    >
      {tasks.length === 0 ? (
        <Typography.Text type="secondary">{t("common:noData")}</Typography.Text>
      ) : (
        <List
          dataSource={tasks}
          renderItem={(task) => (
            <List.Item
              actions={[
                task.status === "downloading" && (
                  <Button size="small" danger icon={<CloseOutlined />}
                    onClick={() => useDownloadStore.getState().updateTask(task.id, { status: "cancelled" })} />
                ),
              ]}
            >
              <List.Item.Meta
                title={task.name}
                description={
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Tag color={statusColor[task.status]}>{task.status}</Tag>
                    <Tag>{task.source}</Tag>
                    {task.status === "downloading" && (
                      <>
                        <Progress percent={task.progress} size="small" />
                        <Typography.Text type="secondary">
                          {task.speedMbps.toFixed(1)} MB/s · ETA {task.etaSeconds}s
                        </Typography.Text>
                      </>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  );
}
