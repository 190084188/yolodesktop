import { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import CustomNode from "./custom-node";
import DetailPanel from "./detail-panel";

const nodeTypes = { custom: CustomNode };

interface ModelGraphProps {
  nodes: Node[];
  edges: Edge[];
}

export default function ModelGraph({ nodes: initialNodes, edges: initialEdges }: ModelGraphProps) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    label: string;
    node_type: string;
    params: Record<string, unknown>;
  } | null>(null);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNode({
      id: node.id,
      label: node.data.label as string,
      node_type: node.data.nodeType as string,
      params: (node.data.params || {}) as Record<string, unknown>,
    });
  }, []);

  return (
    <div style={{ height: 600, border: "1px solid #434343", borderRadius: 6 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const colors: Record<string, string> = {
              conv: "#1677ff", batchnorm: "#52c41a", activation: "#2eb82e",
              pool: "#faad14", merge: "#722ed1", detect: "#ff4d4f",
              bottleneck: "#13c2c2", upsample: "#eb2f96", spp: "#fa8c16",
            };
            return colors[node.data?.nodeType as string] || "#8c8c8c";
          }}
        />
      </ReactFlow>
      <DetailPanel
        open={!!selectedNode}
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}
