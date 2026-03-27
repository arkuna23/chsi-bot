import WebSocket, { type RawData } from 'ws';

import type { OneBotMessageEvent, OneBotRequest, OneBotResponse } from '../types/domain';

type GroupMessageHandler = (event: OneBotMessageEvent) => Promise<void> | void;

export class OneBotClient {
  private ws: WebSocket | null = null;
  private readonly pending = new Map<
    string,
    {
      resolve: (value: OneBotResponse) => void;
      reject: (reason: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private handler: GroupMessageHandler | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private manuallyClosed = false;

  constructor(
    private readonly url: string,
    private readonly accessToken: string | null,
  ) {}

  async connect(): Promise<void> {
    this.manuallyClosed = false;
    await this.openSocket();
  }

  onGroupMessage(handler: GroupMessageHandler): void {
    this.handler = handler;
  }

  async close(): Promise<void> {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await new Promise<void>((resolve) => {
      if (!this.ws) {
        resolve();
        return;
      }
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }

  async sendGroupMessage(groupId: string, message: string): Promise<void> {
    await this.sendRequest({
      action: 'send_group_msg',
      params: {
        group_id: Number(groupId),
        message,
      },
      echo: this.createEcho(),
    });
  }

  private async openSocket(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const headers: Record<string, string> = {};
      if (this.accessToken) {
        headers.Authorization = `Bearer ${this.accessToken}`;
      }

      const ws = new WebSocket(this.url, { headers });
      this.ws = ws;

      ws.once('open', () => {
        this.attachEvents(ws);
        resolve();
      });

      ws.once('error', (error: Error) => {
        reject(error);
      });
    });
  }

  private attachEvents(ws: WebSocket): void {
    ws.on('message', (data: RawData) => {
      void this.handleMessage(data.toString());
    });

    ws.on('close', () => {
      this.ws = null;
      if (!this.manuallyClosed) {
        this.reconnectTimer = setTimeout(() => {
          void this.connect().catch(() => undefined);
        }, 5000);
      }
    });
  }

  private async handleMessage(message: string): Promise<void> {
    const payload = JSON.parse(message) as OneBotResponse | OneBotMessageEvent;

    if ('echo' in payload && payload.echo && this.pending.has(payload.echo)) {
      const pending = this.pending.get(payload.echo)!;
      clearTimeout(pending.timeout);
      this.pending.delete(payload.echo);
      pending.resolve(payload);
      return;
    }

    if (
      this.handler &&
      'post_type' in payload &&
      payload.post_type === 'message' &&
      payload.message_type === 'group'
    ) {
      await this.handler(payload);
    }
  }

  private async sendRequest(request: OneBotRequest): Promise<OneBotResponse> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('OneBot websocket is not connected');
    }

    return new Promise<OneBotResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.echo);
        reject(new Error(`OneBot request timed out: ${request.action}`));
      }, 10000);

      this.pending.set(request.echo, { resolve, reject, timeout });
      ws.send(JSON.stringify(request), (error?: Error) => {
        if (!error) {
          return;
        }
        clearTimeout(timeout);
        this.pending.delete(request.echo);
        reject(error);
      });
    });
  }

  private createEcho(): string {
    return `echo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
