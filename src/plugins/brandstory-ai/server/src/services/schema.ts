import type { Core } from '@strapi/strapi';
import type { AttrInfo, ComponentInfo, ContentTypeInfo } from './types';

export function mapAttribute(name: string, attr: any): AttrInfo {
  const info: AttrInfo = {
    name,
    type: String(attr?.type || 'unknown'),
  };
  if (attr?.multiple) info.multiple = true;
  if (attr?.required) info.required = true;
  if (Array.isArray(attr?.allowedTypes)) info.allowedTypes = attr.allowedTypes.map(String);
  if (Array.isArray(attr?.components)) info.components = attr.components.map(String);
  return info;
}

export function listContentTypes(strapi: Core.Strapi): ContentTypeInfo[] {
  return Object.values(strapi.contentTypes)
    .filter((ct: any) => ct.uid?.startsWith('api::') && ct.kind === 'collectionType')
    .map((ct: any) => ({
      uid: ct.uid as string,
      displayName: (ct.info?.displayName || ct.uid) as string,
      attributes: Object.entries(ct.attributes || {}).map(([name, attr]) =>
        mapAttribute(name, attr)
      ),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function listComponents(strapi: Core.Strapi): ComponentInfo[] {
  return Object.values(strapi.components || {})
    .map((comp: any) => ({
      uid: comp.uid as string,
      displayName: (comp.info?.displayName || comp.uid) as string,
      attributes: Object.entries(comp.attributes || {}).map(([name, attr]) =>
        mapAttribute(name, attr)
      ),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
