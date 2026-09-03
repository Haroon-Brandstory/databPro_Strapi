import { getFetchClient } from '@strapi/strapi/admin';
import pluginId from '../pluginId';

/** Must match server route prefix (under /admin for prod reverse-proxy). */
const prefix = `/admin/${pluginId}`;

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const { get } = getFetchClient();
  const res = await get(`${prefix}${path}`);
  return res.data as T;
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const { post } = getFetchClient();
  const res = await post(`${prefix}${path}`, body ?? {});
  return res.data as T;
}

export async function apiPut<T = unknown>(path: string, body?: unknown): Promise<T> {
  const { put } = getFetchClient();
  const res = await put(`${prefix}${path}`, body ?? {});
  return res.data as T;
}
