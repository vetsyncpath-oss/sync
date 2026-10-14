/** Stage changed runtime members together, before any member is applied. */
export function runtimePackage(path:string):string|undefined {
    const match=/^(\.[^/]+\/(?:plugins|themes)\/[^/]+)\/(?:main\.js|manifest\.json|styles\.css|theme\.css)$/.exec(path);
    return match?.[1];
}
