import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

const NODE_COLORS: Record<string, string> = {
  conv: "#1677ff",
  batchnorm: "#52c41a",
  activation: "#2eb82e",
  pool: "#faad14",
  merge: "#722ed1",
  detect: "#ff4d4f",
  bottleneck: "#13c2c2",
  upsample: "#eb2f96",
  spp: "#fa8c16",
  other: "#8c8c8c",
};

function CustomNode({ data }: NodeProps) {
  const color = NODE_COLORS[data.nodeType as string] || NODE_COLORS.other;

  return (
    <div
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        border: `2px solid ${color}`,
        background: `${color}22`,
        color: "#e0e0e0",
        fontSize: 12,
        minWidth: 120,
        textAlign: "center",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color }} />
      <div style={{ fontWeight: 600, color }}>{data.label as string}</div>
      <Handle type="source" position={Position.Right} style={{ background: color }} />
    </div>
  );
}

export default memo(CustomNode);
