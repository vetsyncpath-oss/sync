import type { SendBudget } from "../core/send-budget";
export interface NetRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | Uint8Array;
  signal?: AbortSignal;
  maxBytes?: number;
  redirect?: "error" | "follow";
  sendBudget?: SendBudget;
}
export interface NetResponse {
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  discard?(): void;
}
export interface NetTransport {
  accountsSendBudget?: boolean;
  fetch(url: string, request: NetRequest): Promise<NetResponse>;
}
