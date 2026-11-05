import type { ComponentProps } from "react";
export default function Image({ preload, unoptimized, ...props }: ComponentProps<"img"> & { preload?: boolean; unoptimized?: boolean }) {
  void preload; void unoptimized;
  return <img {...props} alt={props.alt ?? ""} />;
}
