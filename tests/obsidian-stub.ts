export class App {}
export class Plugin {}
export class PluginSettingTab {}
export class Modal {}
export class Menu {}
export class Notice { constructor(..._args: unknown[]) {} }
export class Setting {}
export const Platform = { isMobileApp: false };
export const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '').trim();
export const requestUrl = async () => { throw new Error('No host requestUrl in unit tests'); };
