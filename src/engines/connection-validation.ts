import type { SourceConnection } from '../core/profiles';
import { EngineRegistry } from './registry';
import { validateSettings } from './schema';

export function connectionValues(connection:SourceConnection):Record<string,unknown> {
    const values={...connection.values};
    for(const field of EngineRegistry.get(connection.kind).settingsSchema)if(values[field.key]===undefined&&field.default!==undefined)values[field.key]=field.default;
    return values;
}
export function connectionIssues(connection:SourceConnection) {
    return validateSettings(EngineRegistry.get(connection.kind).settingsSchema,connectionValues(connection));
}
