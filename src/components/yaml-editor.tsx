import { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import type { ViewUpdate } from "@codemirror/view";

interface YamlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
}

export default function YamlEditor({ value, onChange, readOnly = false, height = "400px" }: YamlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString());
      }
    });

    editorRef.current = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        yaml(),
        oneDark,
        EditorView.editable.of(!readOnly),
        updateListener,
      ],
      parent: containerRef.current,
    });

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.state.doc.toString()) {
      const currentPos = editorRef.current.state.selection.main.head;
      editorRef.current.dispatch({
        changes: { from: 0, to: editorRef.current.state.doc.length, insert: value },
        selection: { anchor: Math.min(currentPos, value.length) },
      });
    }
  }, [value]);

  return <div ref={containerRef} style={{ height, overflow: "auto", border: "1px solid #434343", borderRadius: 4 }} />;
}
