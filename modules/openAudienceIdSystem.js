/**
 * This module adds OpenAudience to the User ID module
 * The {@link module:modules/userId} module is required
 * @module modules/openAudienceSubmodule
 * @requires module:modules/userId
 */

import * as utils from '../src/utils.js'
import {ajax} from '../src/ajax.js';
import {submodule} from '../src/hook.js';

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
  decode(value) {
    return { 'oaid': value }
  },

  /**
   * ConfigObject for ID System
   * TODO: remove this later.  for internal referrence only
   * @property {(string|undefined)} partner - partner url param value
   * @property {(string|undefined)} url - webservice request url used to load Id data
   * @property {(string|undefined)} pixelUrl - publisher pixel to extend/modify cookies
   * @property {(boolean|undefined)} create - create id if missing.  default is true.
   * @property {(boolean|undefined)} extend - extend expiration time on each access.  default is false.
   * @property {(string|undefined)} pid - placement id url param value
   * @property {(string|undefined)} publisherId - the unique identifier of the publisher in question
   * @property {(string|undefined)} ajaxTimeout - the number of milliseconds a resolution request can take before automatically being terminated
   * @property {(array|undefined)} identifiersToResolve - the identifiers from either ls|cookie to be attached to the getId query
   * @property {(string|undefined)} providedIdentifierName - defines the name of an identifier that can be found in local storage or in the cookie jar that can be sent along with the getId request. This parameter should be used whenever a customer is able to provide the most stable identifier possible
   * @property {(LiveIntentCollectConfig|undefined)} liCollectConfig - the config for LiveIntent's collect requests
   */

  /**
   * Initialization object for oa.js
   * TODO: remove this later.  for internal referrence only
   * @property {string} oaID - () planned to be open audience resource id, or that id that will be public to users
   * @property {string} age - () user age supplied by publishers
   * @property {string} gender - () user gender supplied by publishers
   * @property {string} ifa - () ifa -- ID for Ads
   * @property {string} segments - () list of segments the user can be categorized into
   * @property {string} tags - () a way of categorizing users by maps
   * @property {string} tdidPartnerID - partner ID provided by the trade desk, if the publisher registered
   * @property {string} mockTdidEndpoint - () if the pub provided their own tdid solution, otherwise
   * @property {string} delayBeaconSendMs - (500) delay in ms before sending the beacon
   * @property {string} __customBeaconUrl - (https://oajs.openx.net/beacon) beacon endpoint OAJS will try to contact
   * @property {string} customPbjsInstance - (window.pbjs) variable/field where pbjs library is loaded.
   */

  /**
   * performs action to obtain id and return a value in the callback's response argument
   * @function
   * @param {ConsentData} [consentData]
   * @param {SubmoduleParams} [configParams]
   * @returns {IdResponse|undefined}
   */
  getId(configParams, consentData) {
    if (!configParams || typeof configParams.publisherId !== 'string') {
      utils.logError('openAudience submodule requires publisher id to be defined');
      return;
    }
    const hasGdpr = (consentData && typeof consentData.gdprApplies === 'boolean' && consentData.gdprApplies) ? 1 : 0;
    const gdprConsentString = hasGdpr ? consentData.consentString : '';
    // use protocol relative urls for http or https
    const url = `https://openaudience.openx.org?publisher_id=${configParams.publisherId}${hasGdpr ? '&gdpr=' + hasGdpr : ''}${gdprConsentString ? '&gdpr_consent=' + gdprConsentString : ''}`;
    let resp;
    resp = function(callback) {
      // Check ats during callback so it has a chance to initialise.
      // If ats library is available, use it to retrieve envelope. If not use standard third party endpoint
      if (window.oajs) {
        window.oajs.cmd.push(function () {
          window.oajs.start({
            oaID: 'karma-karma-karma-karma-chameleon',
            placementID: 16,
            storageType: 'cookie',
            email: 'chunkylover53@aol.com', // homer's e-mail... replace as you like
            logging: 'debug',
            __customBeaconUrl: 'https://devint-oajs.openx.net/beacon'
          });
        });
      } else {
        getOaid(url, callback);
      }
    };
    return {callback: resp};
  }
};

function getOaid(url, callback) {
  const responseHanlders = {
    success: response => {
      let responseObj = {};
      if (response) {
        try {
          responseObj = JSON.parse(response);
        } catch (error) {
          utils.logError(error);
        }
      }
      callback(responseObj.oaid ? responseObj.oaid : '');
    },
    error: errorResponse => {
      utils.logError(`openAudience: ID fetch encountered an error`, errorResponse);
      callback();
    }
  };

  ajax(url, responseHanlders, undefined, {method: 'GET', withCredentials: true})
}

submodule('userId', openAudienceSubmodule);
