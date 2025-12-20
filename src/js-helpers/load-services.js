const path = require('path');
const fg = require('fast-glob');
const yaml = require('yaml');
const fs = require('fs');

/**
 * @param {Serverless} serverless
 */
exports.functions = async function () {
  const paths = await fg([path.join(__dirname, '../*/serverless.yml')]);

  const files = paths.map((p) => {
    const file = fs.readFileSync(p, 'utf8');
    return yaml.parse(file);
  });
  const services = await Promise.all(files); //* serverless.yml will appear in an object
  return getFunctions(services);
};

/**
 * @param {ServerlessService[]} services
 */
async function getFunctions(services) {
  return services
    .filter((x) => x && x.functions && typeof x.functions === 'object')
    .map(parseApp);
}

/**
 * @param {ServerlessService} appDefinition
 * @returns {FunctionMap}
 */
function parseApp(appDefinition) {
  const { functions: functionDefs } = appDefinition;
  if (Array.isArray(functionDefs)) {
    return Object.assign({}, ...functionDefs.map((x) => fixFunctionMap(x)));
  }

  return fixFunctionMap(functionDefs);
}

/**
 * @param {FunctionMap} fns
 * @returns {FunctionMap}
 */
function fixFunctionMap(fns) {
  return Object.keys(fns).reduce((a, k) => {
    a[k] = fixFunctionDefinition(fns[k]);
    return a;
  }, {});
}

/**
 * @param {FunctionDefinition} lambdaDefinition
 */
function fixFunctionDefinition(lambdaDefinition) {
  const events = lambdaDefinition.events.map((x) =>
    isHttpEvent(x) ? fixHttpEvent(x) : x
  );
  return { ...lambdaDefinition, events };
}

/**
 * @param {FunctionEvent} event
 * @returns {boolean}
 */
function isHttpEvent(event) {
  const keys = Object.keys(event);
  return keys.length === 1 && keys[0] === 'http';
}

/**
 * @param {FunctionHttpEvent} event
 * @returns {FunctionHttpEvent}
 */
function fixHttpEvent(event) {
  const body = event.http;
  const path = `/${body.path}`;
  return { http: { ...body, path } };
}

/**
 * @typedef {import('serverless')} Serverless
 */
/**
 * @typedef {Object} ServerlessService
 * @property {{stage: string}} provider
 * @property {FunctionMap|FunctionMap[]} functions
 */
/**
 * @typedef {{[key: string]: FunctionDefinition}} FunctionMap
 */
/**
 * @typedef {Object} FunctionDefinition
 * @property {string} handler
 * @property {FunctionEvent[]} events
 */
/**
 * @typedef {FunctionHttpEvent} FunctionEvent
 */
/**
 * @typedef {Object} FunctionHttpEvent
 * @property {FunctionHttpEventBody} http
 */
/**
 * @typedef {Object} FunctionHttpEventBody
 * @property {string} method
 * @property {string} path
 * @property {Object} request
 */
