import {createNetlifyHandlers} from '../../../scripts/deployment-gates.mjs';

const handlers=createNetlifyHandlers();
export const onPreBuild=handlers.onPreBuild;
export const onPostBuild=handlers.onPostBuild;
