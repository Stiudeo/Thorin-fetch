'use strict';
import 'whatwg-fetch';
const LOADED_FETCHERS = {};
/**
 * The thorin fetcher create() function will create a named fetcher object and return it.
 * Each fetcher instance can be used separately with different configurations.
 *
 * CONFIGURATION ARGUMENTS:
 *  - url (string) - the full URL of thorin's /dispatch endpoint (defaults to window URL + '/dispatch
 *  - headers (object)  - additional headers to send
 *  - authorization (string) - an additional Authorization: Bearer {token} to attach
 *  - credentials (boolean) - should we send the cookies when calling a different url? defaults to false
* */
function createFetcher(config) {
  if(!config.url) config.url = window.location.href.split(window.location.pathname)[0] + '/dispatch';
  if(typeof config.headers !== 'object' || !config.headers) config.headers = {};
  config.headers['Accept'] = 'application/json';
  config.headers['Content-Type'] = 'application/json';
  if(typeof config.authorization === 'string') {
    config.headers['Authorization'] = 'Bearer ' + config.authorization;
  }
  if(config.credentials === true) {
    config.credentials = 'include';
  }
  if(typeof config.credentials !== 'string') {
    config.credentials = 'same-origin';
  }
  /* This is the fetcher wrapper. */
  function doFetch(action, payload) {
    if(typeof action !== 'string') {
      console.error('thorin-fetcher: usage fetcher("actionName", {payload})');
      return this;
    }
    if(typeof payload === 'undefined' || payload == null) payload = {};
    if(typeof payload !== 'object' && !payload) {
      console.error('thorin-fetcher: payload must be an object.');
      return this;
    }
    const fetchBody = {
      type: action,
      payload: payload
    };
    let statusCode, statusMsg;
    return new Promise((resolve, reject) => {
      fetch(config.url, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify(fetchBody),
        credentials: config.credentials
      }).then((res) => {
        statusCode = res.status;
        statusMsg = res.statusText;
        return res.json();
      }).then((res) => {
        if(res.error) {
          throw res.error;
        }
        delete res.type;
        if(typeof res.meta === 'undefined') {
          return resolve(res.result);
        }
        resolve(res);
      }).catch((e) => {
        let err;
        if(typeof e === 'object' && e) {
          if(e instanceof Error) {
            err = e;
          } else {
            err = new Error(e.message || 'Failed to complete fetch request.');
          }
        } else {
          e = {};
          err = new Error(e.message || 'Failed to complete fetch request');
        }
        Object.keys(e).forEach((key) => {
          err[key] = e[key];
        });
        if(!err.code) err.code = 'SERVER_ERROR';
        if(!err.status) err.status = statusCode;
        reject(err);
      });
    });
  }

  /* Overrides the default configuration with a key/value */
  doFetch.setConfig = function SetConfig(key, value) {
    if(typeof key === 'string' && typeof value !== 'string') {
      if(key === 'authorization') {
        config.headers['Authorization'] = 'Bearer ' + value;
      } else {
        config[key] = value;
      }
      return this;
    }
    console.warn('thorin-fetcher: usage: setConfig(key, value)');
    return this;
  }
  return doFetch;
}

/**
* This is the implicit fetcher creator.
 * Arguments:
 *  - name (string) if specified with no options, it will try returning the given fetcher by name or null.
 *  - name (object) if specified as an object, it will return a fetcher instance withouth caching it.
 *  - opt (object) - used with name, creates and saves a fetcher instance.
* */
module.exports = function(name, opt) {
  // RETURN a fetcher.
  if(typeof name === 'string' && typeof opt === 'undefined') {
    return LOADED_FETCHERS[name] || null;
  }
  // CREATE anonymous
  if(typeof name === 'object' && name && typeof opt === 'undefined') {
    return createFetcher(name);
  }
  // CREATE named fetcher
  if(typeof name === 'string' && typeof opt === 'object' && opt) {
    if(typeof LOADED_FETCHERS[name] !== 'undefined') {
      console.warn('thorin-fetch: fetcher called ' + name + ' already exists. Returning it in stead.');
      return LOADED_FETCHERS[name];
    }
    let fetcherObj = createFetcher(opt);
    LOADED_FETCHERS[name] = fetcherObj;
    return fetcherObj;
  }
  console.error('thorin-fetcher: invalid arguments for fetcher()');
};