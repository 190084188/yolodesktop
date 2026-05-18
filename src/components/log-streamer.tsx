import { useEffect, useRef } from "react";

interface LogStreamerProps {
  lines: string[];
  maxLines?: number;
}

export default function LogStreamer({ lines, maxLines = 500 }: LogStreamerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayLines = lines.slice(-maxLines);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayLines]);

  return (
    <div
      ref={containerRef}
      style={{
        height: 300,
        overflow: "auto",
        background: "#1a1a2e",
        color: "#e0e0e0",
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        fontSize: 12,
        padding: 12,
        borderRadius: 4,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      {displayLines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}
