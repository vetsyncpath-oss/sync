import type { NetTransport, NetRequest } from "../sources/types";
export class SendBudgetError extends Error {}
export class SendBudget {
  private count = 0;
  take() {
    if (++this.count > 3)
      throw new SendBudgetError("Превышен лимит повторов запроса");
  }
}
export function sendWithBudget(
  transport: NetTransport,
  url: string,
  options: NetRequest,
) {
  if (!transport.accountsSendBudget) options.sendBudget?.take();
  return transport.fetch(url, options);
}
