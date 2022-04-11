
import { submodule } from '../src/hook.js';
import { mergeDeep, isPlainObject, logMessage, deepSetValue, generateUUID } from '../src/utils.js';
import { getGlobal } from '../src/prebidGlobal.js';
import {config} from '../src/config.js';

const SUBMODULE_NAME = 'paf';

/**
 *
 * @param {Object} reqBidsConfigObj
 * @param {function} callback
 * @param {Object} rtdConfig
 * @param {Object} userConsent
 */
function getBidRequestData(reqBidsConfigObj, onDone, rtdConfig, userConsent) {
  logMessage('DEBUG(paf):', rtdConfig);
  let idsAndPreferences;
  const adUnits = (reqBidsConfigObj.adUnits || getGlobal().adUnits);

  if (rtdConfig.params && rtdConfig.params.proxyHostName && window.PAF) {
    idsAndPreferences = window.PAF.getIdsAndPreferences();
    if (!idsAndPreferences) {
      onDone();
      return;
    }

    let transaction_ids = [];
    for (var i=0; i < adUnits.length; i++) {
      const uuid = generateUUID();
      transaction_ids.push(uuid)
      deepSetValue(adUnits[i], `ortb2Imp.ext.data.paf.transaction_id`, uuid)
    }

    logMessage('DEBUG(idsAndPreferences):', idsAndPreferences);
    window.PAF.createSeed({proxyHostName: rtdConfig.params.proxyHostName, callback: function (seed) {setData(seed, rtdConfig, onDone);}}, transaction_ids)
  } else {
    onDone();
    return;
  }
}

/**
 * Lazy merge objects.
 * @param {Object} target
 * @param {Object} source
 */
 function mergeLazy(target, source) {
  if (!isPlainObject(target)) {
    target = {};
  }

  if (!isPlainObject(source)) {
    source = {};
  }

  return mergeDeep(target, source);
}

function setData(seed, rtdConfig, onDone) {
  logMessage('DEBUG(seed):', seed);
  const pafOrtb2 = {
    ortb2: {
      user: {
        ext: {
          paf: {
            transmission: {
              seed: seed
            }
          }
        }
      }
    }
  }

  if (rtdConfig.params && rtdConfig.params.bidders) {
    let bidderConfig = config.getBidderConfig();
    logMessage(`set ortb2 for: ${rtdConfig.params.bidders}`, pafOrtb2);
    rtdConfig.params.bidders.forEach(bidder => {
      let bidderOptions = {};
      if (isPlainObject(bidderConfig[bidder])) {
        bidderOptions = bidderConfig[bidder];
      }

      config.setBidderConfig({
        bidders: [bidder],
        config: mergeLazy(bidderOptions, pafOrtb2)
      });
    });
  } else {
    let ortb2 = config.getConfig('ortb2') || {};
    logMessage('DEBUG(set ortb2):', pafOrtb2);
    config.setConfig({ortb2: mergeLazy(ortb2, pafOrtb2.ortb2)});
  }
  onDone();
}

/** @type {RtdSubmodule} */
export const pafDataSubmodule = {
  /**
   * used to link submodule with realTimeData
   * @type {string}
   */
  name: SUBMODULE_NAME,
  init: () => true,
  getBidRequestData,
};

function registerSubModule() {
  submodule('realTimeData', pafDataSubmodule);
}

registerSubModule();
