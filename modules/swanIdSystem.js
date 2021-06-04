/**
 * This module adds swanId to the User ID module
 * The {@link module:modules/userId} module is required
 * @module modules/swanIdSystem
 * @requires module:modules/userId
 */

 import {submodule} from '../src/hook.js';

 /** @type {Submodule} */
 export const swanIdSubmodule = {
   /**
    * used to link submodule with config
    * @type {string}
    */
   name: 'swanId',
   /**
    * decode the stored id value for passing to bid requests
    * @function decode
    * @param {(Object|string)} value
    * @returns {(Object|undefined)}
    */
   decode(id) {
     return { swanId: id };
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
     if (config && config.params && config.params.id) {
       return {'id': config.params.id};
     } else {
       return undefined
     }
 
   }
 };
 
 submodule('userId', swanIdSubmodule);