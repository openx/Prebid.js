/**
 * This module adds Onekey data to the User ID module
 * The {@link module:modules/userId} module is required
 * @module modules/oneKeyIdSystem
 * @requires module:modules/userId
 */

import {submodule} from '../src/hook.js';

window.PAF = window.PAF || {};
window.PAF.queue = window.PAF.queue || [];

/** @type {Submodule} */
export const oneKeyIdSubmodule = {
  /**
    * used to link submodule with config
    * @type {string}
    */
  name: 'oneKeyData',
  /**
    * decode the stored data value for passing to bid requests
    * @function decode
    * @param {(Object|string)} value
    * @returns {(Object|undefined)}
    */
  decode(data) {
    return { pafData: data };
  },
  /**
    * performs action to obtain id and return a value in the callback's response argument
    * @function
    * @param {SubmoduleConfig} [config]
    * @param {ConsentData} [consentData]
    * @param {(Object|undefined)} cacheIdObj
    * @returns {IdResponse|undefined}
    */
  getId(config, consentData) {
    const idResponseCallback = function (callbackResp) {
      window.PAF.queue.push(function() {
        if (config.params === undefined || config.params.proxyHostName === undefined) {
          callbackResp();
          return
        }
        const options = {
          proxyHostName: config.params.proxyHostName,
          callback: callbackResp
        };
        window.PAF.getIdsAndPreferencesAsync(options);
      });
    };

    return { callback: idResponseCallback };
  }
};

submodule('userId', oneKeyIdSubmodule);
