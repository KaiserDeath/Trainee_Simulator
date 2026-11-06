import {HubError} from './HubError.js';

export function createHubDirectory(client) {
  return async (identity, kind, query = {}) => {
    const limit = Number(query.limit ?? 50);
    const search = String(query.search || '').trim();
    const status = String(query.status || '');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || search.length > 120 || !['','active','deactivated'].includes(status) || (query.cursor && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(query.cursor))) {
      throw new HubError(400,'HUB_VALIDATION_ERROR','Invalid directory filters.');
    }
    const {data,error} = await client.rpc('hub_directory_page', {p_external_subject:identity.subjectId,p_kind:kind,p_cursor:query.cursor||null,p_limit:limit,p_search:search,p_status:status});
    if(error) throw new HubError(503,'HUB_DIRECTORY_UNAVAILABLE','The directory could not be loaded. Try again.');
    return {[kind==='accounts'?'accounts':'postulantes']:data.rows,page:{nextCursor:data.nextCursor,total:data.total,retrievedAt:data.retrievedAt,scope:data.scope}};
  };
}
