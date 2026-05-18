use serde::Serialize;
use crate::errors::{AppError, AppResult};

#[derive(Debug, Serialize, Clone)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub params: serde_json::Value,
    pub position: NodePosition,
}

#[derive(Debug, Serialize, Clone)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct GraphEdge {
    pub id: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Serialize)]
pub struct ModelGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

pub fn parse_model_yaml(yaml_content: &str) -> AppResult<ModelGraph> {
    let parsed: serde_yaml::Value = serde_yaml::from_str(yaml_content)
        .map_err(|e| AppError::CommandFailed(format!("YAML parse error: {}", e)))?;

    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut y = 0.0;

    let backbone = parsed.get("backbone");
    let head = parsed.get("head");

    if let Some(backbone_list) = backbone.and_then(|b| b.as_sequence()) {
        for (i, entry) in backbone_list.iter().enumerate() {
            let (layer_type, params) = parse_layer_entry(entry);
            let id = format!("backbone_{}", i);
            let label = format!("{} #{}", layer_type, i);

            nodes.push(GraphNode {
                id: id.clone(),
                label: label.clone(),
                node_type: classify_node_type(&layer_type),
                params: params.clone(),
                position: NodePosition { x: 250.0, y },
            });

            if i > 0 {
                edges.push(GraphEdge {
                    id: format!("edge_backbone_{}_{}", i - 1, i),
                    from: format!("backbone_{}", i - 1),
                    to: id,
                });
            }

            y += 100.0;
        }
    }

    if let Some(head_list) = head.and_then(|h| h.as_sequence()) {
        let backbone_count = nodes.len();
        for (i, entry) in head_list.iter().enumerate() {
            let (layer_type, params) = parse_layer_entry(entry);
            let id = format!("head_{}", i);
            let label = format!("{} #{}", layer_type, i);

            nodes.push(GraphNode {
                id: id.clone(),
                label: label.clone(),
                node_type: classify_node_type(&layer_type),
                params: params.clone(),
                position: NodePosition { x: 600.0, y: (i as f64) * 100.0 },
            });

            if i > 0 {
                edges.push(GraphEdge {
                    id: format!("edge_head_{}_{}", i - 1, i),
                    from: format!("head_{}", i - 1),
                    to: id,
                });
            } else if backbone_count > 0 {
                edges.push(GraphEdge {
                    id: "edge_backbone_to_head".to_string(),
                    from: format!("backbone_{}", backbone_count - 1),
                    to: id,
                });
            }
        }
    }

    if nodes.is_empty() {
        if let Some(arr) = parsed.as_sequence() {
            for (i, entry) in arr.iter().enumerate() {
                let (layer_type, params) = parse_layer_entry(entry);
                let id = format!("layer_{}", i);
                nodes.push(GraphNode {
                    id: id.clone(),
                    label: format!("{} #{}", layer_type, i),
                    node_type: classify_node_type(&layer_type),
                    params: params.clone(),
                    position: NodePosition { x: 250.0, y: (i as f64) * 100.0 },
                });
                if i > 0 {
                    edges.push(GraphEdge {
                        id: format!("edge_{}_{}", i - 1, i),
                        from: format!("layer_{}", i - 1),
                        to: id,
                    });
                }
            }
        }
    }

    Ok(ModelGraph { nodes, edges })
}

fn parse_layer_entry(entry: &serde_yaml::Value) -> (String, serde_json::Value) {
    match entry {
        serde_yaml::Value::Sequence(seq) if !seq.is_empty() => {
            let layer_type = seq[0].as_str().unwrap_or("Unknown").to_string();
            let args = if seq.len() > 1 {
                serde_json::to_value(&seq[1]).unwrap_or(serde_json::Value::Null)
            } else {
                serde_json::Value::Null
            };
            (layer_type, args)
        }
        serde_yaml::Value::String(s) => (s.clone(), serde_json::Value::Null),
        other => ("Unknown".to_string(), serde_json::to_value(other).unwrap_or(serde_json::Value::Null)),
    }
}

fn classify_node_type(name: &str) -> String {
    let name_lower = name.to_lowercase();
    if name_lower.contains("conv") || name_lower.contains("cbs") || name_lower.contains("cbl") {
        "conv".into()
    } else if name_lower.contains("bn") || name_lower.contains("batchnorm") {
        "batchnorm".into()
    } else if name_lower.contains("relu") || name_lower.contains("silu") || name_lower.contains("mish")
        || name_lower.contains("leaky") || name_lower.contains("activation") || name_lower.contains("act") {
        "activation".into()
    } else if name_lower.contains("pool") || name_lower.contains("maxpool") || name_lower.contains("avgpool") {
        "pool".into()
    } else if name_lower.contains("concat") || name_lower.contains("add") || name_lower.contains("shortcut") {
        "merge".into()
    } else if name_lower.contains("detect") || name_lower.contains("head") {
        "detect".into()
    } else if name_lower.contains("c2f") || name_lower.contains("c3") || name_lower.contains("bottleneck") {
        "bottleneck".into()
    } else if name_lower.contains("upsample") || name_lower.contains("resize") {
        "upsample".into()
    } else if name_lower.contains("sppf") || name_lower.contains("spp") {
        "spp".into()
    } else {
        "other".into()
    }
}

#[tauri::command]
pub fn parse_model_config(yaml_content: String) -> Result<ModelGraph, AppError> {
    parse_model_yaml(&yaml_content)
}
