import { DOMParser, type Element } from '@xmldom/xmldom';

const DAV = 'DAV:';

export interface WebDavResource {
        href: string;
        etag: string | null;
        size: number | null;
        lastModified: string | null;
        isCollection: boolean;
}

function children(parent: Element, name?: string): Element[] {
        const result: Element[] = [];
        for (let child = parent.firstChild; child; child = child.nextSibling) {
                if (child.nodeType === 1) {
                        const element = child as Element;
                        if (element.namespaceURI === DAV && (name === undefined || element.localName === name)) result.push(element);
                }
        }
        return result;
}

function single(parent: Element, name: string, required = false): Element | null {
        const matches = children(parent, name);
        if (matches.length > 1 || (required && matches.length !== 1)) throw new Error(`Invalid WebDAV ${name}`);
        return matches[0] ?? null;
}

function status(element: Element): number {
        const value = single(element, 'status', true)!.textContent?.trim() ?? '';
        const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s|$)/.exec(value);
        if (!match) throw new Error('Invalid WebDAV status');
        return Number(match[1]);
}

/** Partial or ambiguous XML must never become an authoritative empty inventory. */
export function parseMultiStatus(xml: string): WebDavResource[] {
        if (xml.length > 16 * 1024 * 1024 || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('Unsupported WebDAV XML document');
        const document = new DOMParser({ onError: (_level, message) => { throw new Error(message); } }).parseFromString(xml, 'application/xml');
        const root = document.documentElement;
        if (!root || root.namespaceURI !== DAV || root.localName !== 'multistatus') throw new Error('Invalid WebDAV multistatus');
        for (let child = root.firstChild; child; child = child.nextSibling) {
                if (child.nodeType === 1 && (child as Element).localName === 'response' && (child as Element).namespaceURI !== DAV) {
                        throw new Error('Invalid WebDAV response namespace');
                }
        }
        const responses = children(root, 'response');
        if (responses.length === 0) throw new Error('WebDAV response contains no resources');
        return responses.map(response => {
                const href = single(response, 'href', true)!.textContent?.trim();
                if (!href) throw new Error('Invalid WebDAV href');
                if (single(response, 'status') && status(response) !== 200) throw new Error('WebDAV resource listing failed');
                const properties = new Map<string, Element>();
                const propstats = children(response, 'propstat');
                if (propstats.length === 0) throw new Error('WebDAV resource has no properties');
                for (const propstat of propstats) {
                        const code = status(propstat);
                        if (code === 404) continue; // unavailable optional properties never supply values
                        if (code !== 200) throw new Error(`WebDAV property listing failed: ${code}`);
                        for (const property of children(single(propstat, 'prop', true)!)) {
                                const name = property.localName;
                                if (!name || properties.has(name)) throw new Error('Duplicate WebDAV property');
                                properties.set(name, property);
                        }
                }
                const type = properties.get('resourcetype');
                if (!type) throw new Error('WebDAV resource type is unavailable');
                const isCollection = children(type, 'collection').length > 0;
                const sizeText = properties.get('getcontentlength')?.textContent?.trim();
                let size: number | null = null;
                if (sizeText !== undefined && /^\d+$/.test(sizeText)) {
                        const value = Number(sizeText);
                        if (Number.isSafeInteger(value)) size = value;
                }
                if (!isCollection && size === null) throw new Error('WebDAV file size is unavailable');
                const text = (name: string) => properties.get(name)?.textContent?.trim() || null;
                return { href, size, isCollection, etag: text('getetag'), lastModified: text('getlastmodified') };
        });
}

function pathSegments(url: URL): string[] {
        return url.pathname.split('/').filter(Boolean).map(segment => {
                const decoded = decodeURIComponent(segment);
                if (!decoded || decoded === '.' || decoded === '..' || /[\/\\\0]/.test(decoded)) throw new Error('Ambiguous WebDAV path');
                return decoded;
        });
}

export function resolveDavResource(href: string, requestUrl: string, rootUrl: string): { path: string; url: string } {
        const root = new URL(rootUrl);
        const resource = new URL(href, requestUrl);
        if (resource.origin !== root.origin || resource.username || resource.password || resource.hash) throw new Error('WebDAV resource is outside the trusted origin');
        const rootSegments = pathSegments(root);
        const segments = pathSegments(resource);
        if (segments.length < rootSegments.length || rootSegments.some((segment, i) => segment !== segments[i])) throw new Error('WebDAV resource is outside the configured root');
        return { path: segments.slice(rootSegments.length).join('/'), url: resource.toString() };
}
