declare module "react-test-renderer" {
  import type { ReactElement } from "react";

  export type ReactTestRenderer = {
    unmount(): void;
  };

  export function act<T>(callback: () => T | Promise<T>): Promise<T>;
  export function create(element: ReactElement): ReactTestRenderer;
}
