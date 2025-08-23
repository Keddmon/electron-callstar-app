export type IpcResult<T> = {
    data: T | null;
    error: string | null;
};