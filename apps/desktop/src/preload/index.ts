import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

export interface IpcResult<T> {
  ok: true;
  data: T;
}
export interface IpcError {
  ok: false;
  code: string;
  message: string;
}
export type IpcEnvelope<T> = IpcResult<T> | IpcError;

const api = {
  /** 通用调用：返回 {ok:true,data} | {ok:false,code,message} */
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<IpcEnvelope<T>> {
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcEnvelope<T>>;
  },
  health: (): Promise<{ ok: boolean; dataDir: string }> => ipcRenderer.invoke('health'),
  /** 订阅数据变更（写操作后广播），返回取消订阅函数 */
  onDataChanged: (cb: () => void): (() => void) => {
    const listener = (_e: IpcRendererEvent): void => cb();
    ipcRenderer.on('data-changed', listener);
    return () => ipcRenderer.removeListener('data-changed', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
