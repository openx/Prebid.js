/**
 * This module adds OpenAudience to the User ID module
 * The {@link module:modules/userId} module is required
 * @module modules/openAudienceIdSystem
 * @requires module:modules/userId
 */

import * as utils from '../src/utils.js'
import {ajax} from '../src/ajax.js';
import {submodule} from '../src/hook.js';
import {uspDataHandler} from '../src/adapterManager.js';

export const OA_URL = 'https://oajs.openx.net/beacon';

// Module types
/**
 * @typedef {Object} OpenAudienceConfig
 * @property {string} resourceId The OpenAudience resource id
 */

/**
 * @typedef {Object} OpenAudienceIdObject
 * @property {Array<string>} oa_ids A list of OpenAudience Ids
 */

/** @type {Submodule} */
export const openAudienceSubmodule = {
  /**
   * used to link submodule with config
   * @type {string}
   */
  name: 'openAudience',
  /**
   * decode the stored id value for passing to bid requests
   * @function
   * @param {string} value
   * @returns {{oaid:string}}
   */

  /**
   *
   * @param {OpenAudienceIdObject|undefined} storedIdObj The current cached object
   * @param {OpenAudienceConfig|undefined} configParams
   * @returns {{oa: OpenAudienceIdObject}}
   */
  decode(storedIdObj, configParams) {
    return { 'oa': storedIdObj };
  },

  /**
   * performs action to obtain id and return a value in the callback's response argument
   * @param {OpenAudienceConfig} configParams
   * @param {ConsentData|undefined} consentData
   * @param {(OpenAudienceIdObject|undefined)} cacheIdObj
   * @return {(IdResponse|undefined)} A response object that contains id and/or callback.
   */
  getId(configParams, consentData, cacheIdObj) {
    if (!configParams || typeof configParams.resourceId !== 'string') {
      utils.logError('openAudience submodule requires resource id to be defined');
      return;
    }



    return {callback: getOaIds};

    /**
     * Requests for OpenAudienceIDs through oajs and fallback directly to API.
     * @param callback
     */
    function getOaIds(callback) {
      // If oajs is available, use it to retrieve id object. If not, fall back to API.
      if (window.oajs) {
        window.oajs.getIds(callback);
      } else {
        let params = {
          rid: configParams.resourceId,
          ...getConsentQueryParams(consentData, uspDataHandler.getConsentData())
      };
        getOaData(`${OA_URL}?${utils.formatQS(params)}`, callback);
      }

      function getConsentQueryParams(gdprConsent, usPrivacy) {
        const hasGdpr = (gdprConsent && typeof gdprConsent.gdprApplies === 'boolean' && gdprConsent.gdprApplies) ? 1 : 0;

        let consentParams = {
          gdpr: hasGdpr
        };

        if (hasGdpr) {
          consentParams.gdpr_consent = gdprConsent && gdprConsent.consentString
        }

        if (usPrivacy) {
          consentParams.us_privacy = usPrivacy;
        }

        return consentParams;
      }
    }
  }
};

function getOaData(url, callback) {
  const responseHandlers = {
    success: response => {
      let responseObj = {};
      if (response) {
        try {
          responseObj = JSON.parse(response);
        } catch (error) {
          utils.logError(error);
        }
      }
      callback(responseObj.oa_ids && responseObj.oa_ids.length !== undefined ? responseObj : undefined);
    },
    error: errorResponse => {
      utils.logError(`openAudience: ID fetch encountered an error`, errorResponse);
      callback();
    }
  };

  ajax(url, responseHandlers, undefined, {method: 'GET', withCredentials: true});
}

submodule('userId', openAudienceSubmodule);
