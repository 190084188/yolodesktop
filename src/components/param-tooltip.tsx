import { QuestionCircleOutlined } from "@ant-design/icons";
import { Tooltip, Typography } from "antd";

interface ParamTooltipProps {
  label: string;
  tooltip: string;
}

export default function ParamTooltip({ label, tooltip }: ParamTooltipProps) {
  return (
    <span>
      <Typography.Text>{label}</Typography.Text>
      <Tooltip title={tooltip}>
        <QuestionCircleOutlined style={{ marginLeft: 4, color: "#888", cursor: "help" }} />
      </Tooltip>
    </span>
  );
}

// Parameter definitions from ultralytics/cfg/default.yaml
export const PARAM_DEFS: Record<string, string> = {
  epochs: "训练的总轮数。较大的值可能提高精度但增加训练时间。建议值: 100-300。",
  batch: "每批处理的图片数量。较大的批次需要更多显存但训练更稳定。建议值: 8-64。",
  imgsz: "输入图片的尺寸（像素）。较大的尺寸提高精度但增加显存和计算量。建议值: 320-1280。",
  device: "训练设备。可设为 'cpu'、'cuda:0'（单GPU）、或 '0,1,2'（多GPU）。",
  workers: "数据加载的并行进程数。建议设为 CPU 核心数，不要超过 8。",
  optimizer: "优化器类型。AdamW 收敛快，SGD 更稳定。可选: SGD, Adam, AdamW, RMSProp。",
  lr0: "初始学习率。较大的值加速收敛但可能不稳定。建议值: 0.001-0.01。",
  lrf: "最终学习率因子。最终 lr = lr0 * lrf。较小的值使训练更精细。建议值: 0.01-0.2。",
  momentum: "SGD 动量因子。影响梯度下降的速度和稳定性。建议值: 0.9-0.98。",
  weight_decay: "权重衰减（L2 正则化）。防止过拟合。建议值: 0.0001-0.001。",
  warmup_epochs: "学习率预热轮数。逐步增加学习率，避免训练初期的数值不稳定。建议值: 1-5。",
  warmup_momentum: "预热阶段的初始动量值。",
  hsv_h: "色调增强范围（度）。随机调整图片色调。建议值: 0.0-0.02。",
  hsv_s: "饱和度增强范围。建议值: 0.0-1.0。",
  hsv_v: "亮度增强范围。建议值: 0.0-1.0。",
  degrees: "随机旋转角度范围。建议值: 0.0-45.0。",
  translate: "随机平移范围（比例）。建议值: 0.0-0.5。",
  scale: "随机缩放范围（比例）。建议值: 0.0-0.9。",
  mosaic: "马赛克增强概率。将4张图拼接为1张训练。1.0 表示始终使用。建议值: 0.0-1.0。",
  mixup: "混合增强概率。将两张图片按比例混合。建议值: 0.0-1.0。",
  fliplr: "左右翻转概率。0.5 表示50%的概率进行左右翻转。",
  flipud: "上下翻转概率。通常仅在特定场景（如航拍）使用。",
  patience: "早停耐心值。验证集指标连续 N 轮不提升则停止训练。建议值: 20-100。",
  save_period: "每 N 轮保存一次检查点。-1 表示仅保存最佳和最后一个。",
  cos_lr: "使用余弦学习率衰减。相比线性衰减更平滑。",
  close_mosaic: "最后 N 轮关闭马赛克增强。防止训练末期不稳定。建议值: 10-15。",
  amp: "自动混合精度训练。在支持的 GPU 上可加速训练并节省显存。",
};
