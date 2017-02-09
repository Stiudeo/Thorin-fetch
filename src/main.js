'use strict';
import 'whatwg-fetch';
const LOADED_FETCHERS = {},
  FETCHER_EVENTS = {
    error: [],
    success: []
  };       // a hash of {error:[fns],success:[fns]} listeners for all the fetchers.

function parseConfig(config) {
  if (!config.url) {
    if (window.location.pathname === '/') {
      config.url = window.location.href.substr(0, window.location.href.length - 1);
    } else {
      config.url = window.location.href.split(window.location.pathname)[0];
    }
    config.url += '/dispatch';
  }

  let tmp = config.url.split('://'),
    full = tmp[0] + '://' + tmp[1].replace(/\/\//g, '/');
  config.url = full;
  if (typeof config.headers !== 'object' || !config.headers) config.headers = {};
  config.headers['Accept'] = 'application/json';
  config.headers['Content-Type'] = 'application/json';
  if (typeof config.authorization === 'string') {
    config.headers['Authorization'] = 'Bearer ' + config.authorization;
  }
  if (config.credentials === true) {
    config.credentials = 'include';
  }
  if (typeof config.credentials !== 'string') {
    config.credentials = 'same-origin';
  }
  return config;
}

function registerFetchEvent(name, type, fn) {
  if (['success', 'error'].indexOf(type) === -1) {
    console.warn('thorin-fetcher: on(event, fn): event should be either error or success.');
    return false;
  }
  if (typeof fn !== 'function') {
    console.warn('thorin-fetcher: on(event, fn): fn should be a function');
    return false;
  }
  let item = {
    fn: fn
  };
  if (typeof name === 'string') item.name = name;
  FETCHER_EVENTS[type].push(item);
  return true;
}

function handleFetchEvent(name, type, data) {
  if (typeof FETCHER_EVENTS[type] === 'undefined') return;
  if (FETCHER_EVENTS[type].length === 0) return;
  for (let i = 0; i < FETCHER_EVENTS[type].length; i++) {
    let item = FETCHER_EVENTS[type][i],
      shouldCall = (typeof item.name === 'string' && item.name === name) || (typeof item.name === 'undefined');
    if (!shouldCall) continue;
    item.fn(data);
  }
}

function parseError(e, _status) {
  let err;
  if (typeof e === 'object' && e) {
    if (e instanceof Error) {
      if (e instanceof TypeError || e instanceof SyntaxError) {
        if (_status >= 500 && status <= 599) {
          if (_status === 502 || _status === 503) {
            err = new Error("The requested resource is temporary unavailable");
          } else {
            err = new Error('An unexpected error occurred');
          }
        } else {
          err = new Error('An error occurred while loading resources');
        }
      } else {
        err = e;
      }
    } else {
      err = new Error(e.message || 'An error occurred while loading resources');
    }
  } else {
    e = {};
    err = new Error(e.message || 'An error occurred while loading resources');
  }
  Object.keys(e).forEach((key) => {
    err[key] = e[key];
  });
  if (!err.code) err.code = 'SERVER_ERROR';
  if (_status) err.status = _status;
  if (!err.status) err.status = 500;
  return err;
}

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
function createFetcher(config, name) {
  parseConfig(config);
  /* This is the fetcher wrapper. */
  function doFetch(action, payload) {
    let filter;
    if (typeof action === 'object' && action && typeof action.type === 'string') {
      payload = action.payload;
      action = action.type;
      filter = action.filter;
    }
    if (typeof action !== 'string') {
      console.error('thorin-fetcher: usage fetcher("actionName", {payload})');
      return this;
    }
    if (typeof payload === 'undefined' || payload == null) payload = {};
    if (typeof payload !== 'object' && !payload) {
      console.error('thorin-fetcher: payload must be an object.');
      return this;
    }
    if (typeof payload.filter === 'object' && payload.filter) {
      filter = payload.filter;
    }
    if (typeof payload.payload === 'object' && payload.payload) {
      payload = payload.payload;
    }
    const fetchBody = {
      type: action,
      payload: payload
    };
    if (typeof filter === 'object' && filter) {
      fetchBody.filter = filter;
    }
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
        if (res.error) {
          throw res.error;
        }
        delete res.type;
        if (typeof res.meta === 'undefined') {
          handleFetchEvent(name, 'success', res.result);
          return resolve(res.result);
        }
        handleFetchEvent(name, 'success', res);
        resolve(res);
      }).catch((e) => {
        let err = parseError(e, statusCode);
        handleFetchEvent(name, 'error', err);
        reject(err);
      });
    });
  }

  /* Overrides the default configuration with a key/value */
  doFetch.setConfig = function SetConfig(key, value) {
    if (key === "authorization" && typeof value === 'string') {
      config.headers['Authorization'] = 'Bearer ' + value;
      return this;
    }
    if (typeof key === 'string' && typeof value !== 'string') {
      config[key] = value;
      return this;
    }
    console.warn('thorin-fetcher: usage: setConfig(key, value)');
    return this;
  };

  /* Listen for errors that the fetcher may have encountered. */
  doFetch.on = registerFetchEvent.bind(this, name);
  return doFetch;
}

/**
 * Prepares a file upload fetcher.
 * This works perfectly with thorin-plugin-upload
 * SAME configuration
 * */
function createUploadFetcher(config) {
  parseConfig(config);
  if (!config.name) config.name = 'asset'; // the name of the file input
  delete config.headers['Content-Type'];
  const obj = {};
  let name = 'upload' + nidx;
  nidx++;
  /*
   * Creates an actual fetch request to be sent.
   * */
  obj.send = function SendUpload(fileObj) {
    return new Promise((resolve, reject) => {
      if (typeof fileObj !== 'object' || !fileObj || typeof fileObj.type !== 'string' || typeof fileObj.name !== 'string') {
        return reject(parseError(new Error('Please select a file to upload.')));
      }
      var data = new FormData();
      data.append(config.name, fileObj);
      let statusCode, statusMsg;
      const fetchOpt = {
        method: 'POST',
        headers: config.headers,
        credentials: config.credentials,
        body: data
      };
      fetch(config.url, fetchOpt).then((res) => {
        statusCode = res.status;
        statusMsg = res.statusText;
        return res.json();
      }).then((res) => {
        if (res.error) {
          throw res.error;
        }
        delete res.type;
        if (typeof res.meta === 'undefined') {
          handleFetchEvent(name, 'success', res.result);
          return resolve(res.result);
        }
        handleFetchEvent(name, 'success', res);
        resolve(res);
      }).catch((e) => {
        let err = parseError(e, statusCode);
        handleFetchEvent(name, 'error', err);
        reject(err);
      });
    });
  };
  obj.on = registerFetchEvent.bind(this, name);
  return obj;
}

/**
 * This is the implicit fetcher creator.
 * Arguments:
 *  - name (string) if specified with no options, it will try returning the given fetcher by name or null.
 *  - name (object) if specified as an object, it will return a fetcher instance withouth caching it.
 *  - opt (object) - used with name, creates and saves a fetcher instance.
 * */
let nidx = 0;
function create(name, opt) {
  // RETURN a fetcher.
  if (typeof name === 'string' && typeof opt === 'undefined') {
    return LOADED_FETCHERS[name] || null;
  }
  nidx++;
  // CREATE anonymous
  if (typeof name === 'object' && name && typeof opt === 'undefined') {
    return createFetcher(name, 'fetcher' + nidx);
  }
  // CREATE named fetcher
  if (typeof name === 'string' && typeof opt === 'object' && opt) {
    if (typeof LOADED_FETCHERS[name] !== 'undefined') {
      console.warn('thorin-fetch: fetcher called ' + name + ' already exists. Returning it in stead.');
      return LOADED_FETCHERS[name];
    }
    let fetcherObj = createFetcher(opt, name);
    LOADED_FETCHERS[name] = fetcherObj;
    return fetcherObj;
  }
  console.error('thorin-fetcher: invalid arguments for fetcher()');
}
module.exports = create;
/*
 * Attach the createUploadFetcher functionality
 * */
module.exports.upload = createUploadFetcher;
/* Listen to specific events on all fetchers. */
module.exports.on = registerFetchEvent.bind(module.exports, undefined);