import type { SourceConnection } from '../core/profiles';
import { EngineRegistry } from './registry';
import { validateSettings } from './schema';

export function connectionValues(connection:SourceConnection):Record<string,unknown> {
    const values={...connection.values};
    for(const field of EngineRegistry.get(connection.kind).settingsSchema)if(values[field.key]===undefined&&field.default!==undefined)values[field.key]=field.default;
    return values;
}
export function connectionIssues(connection:SourceConnection) {
    if(connection.kind==='gdrive'&&connection.values.authMode==='oauth-desktop')return ['folderId','clientId','accountSub','secretRef'].flatMap(field=>
        typeof connection.values[field]==='string'&&String(connection.values[field]).trim()?[]:[{field,code:'required' as const}]);
    return validateSettings(EngineRegistry.get(connection.kind).settingsSchema,connectionValues(connection));
}
