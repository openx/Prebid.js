
import { submodule } from '../src/hook.js';
import { mergeDeep, isPlainObject, logError, logMessage, deepSetValue, generateUUID } from '../src/utils.js';
import { getGlobal } from '../src/prebidGlobal.js';
import {config} from '../src/config.js';

const SUBMODULE_NAME = 'oneKey';

window.PAF = window.PAF || {};
window.PAF.queue = window.PAF.queue || [];

/**
 *
 * @param {Object} reqBidsConfigObj
 * @param {function} callback
 * @param {Object} rtdConfig
 * @param {Object} userConsent
 */
export function getBidRequestData(reqBidsConfigObj, onDone, rtdConfig, userConsent) {
  if (rtdConfig.params === undefined || rtdConfig.params.proxyHostName === undefined) {
    onDone();
    return
  }
  window.PAF.queue.push(function() {
    const idsAndPreferencesAsyncOptions = {
      proxyHostName: rtdConfig.params.proxyHostName,
      callback: function (idsAndPreferences) {
        if (!idsAndPreferences) {
          onDone();
          logMessage(SUBMODULE_NAME, 'No id and preferences. Not creating Seed.');
          return;
        }

        const adUnits = (reqBidsConfigObj.adUnits || getGlobal().adUnits);
        let transactionIds = [];
        for (var i = 0; i < adUnits.length; i++) {
          const uuid = generateUUID();
          transactionIds.push(uuid)
          deepSetValue(adUnits[i], `ortb2Imp.ext.data.paf.transaction_id`, uuid)
        }

        const generateSeedOption = {
          proxyHostName: rtdConfig.params.proxyHostName,
          callback: function (seed) {
            setData(seed, rtdConfig, onDone);
          }
        }
        window.PAF.generateSeed(generateSeedOption, transactionIds)
      }
    };

    window.PAF.getIdsAndPreferencesAsync(idsAndPreferencesAsyncOptions);
  });
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

export function setData(seed, rtdConfig, onDone) {
  if (!seed) {
    logError(SUBMODULE_NAME, 'Could not createSeed');
    onDone()
    return;
  }
  logMessage(SUBMODULE_NAME, 'Created Seed:', seed);
  const okOrtb2 = {
    ortb2: {
      user: {
        ext: {
          paf: {
            transmission: {
              seed
            }
          }
        }
      }
    }
  }

  if (rtdConfig.params && rtdConfig.params.bidders) {
    let bidderConfig = config.getBidderConfig();
    logMessage(SUBMODULE_NAME, `set ortb2 for: ${rtdConfig.params.bidders}`, okOrtb2);
    rtdConfig.params.bidders.forEach(bidder => {
      let bidderOptions = {};
      if (isPlainObject(bidderConfig[bidder])) {
        bidderOptions = bidderConfig[bidder];
      }

      config.setBidderConfig({
        bidders: [bidder],
        config: mergeLazy(bidderOptions, okOrtb2)
      });
    });
  } else {
    let ortb2 = config.getConfig('ortb2') || {};
    logMessage(SUBMODULE_NAME, 'set ortb2:', okOrtb2);
    config.setConfig({ortb2: mergeLazy(ortb2, okOrtb2.ortb2)});
  }
  onDone();
}

/** @type {RtdSubmodule} */
export const oneKeyDataSubmodule = {
  /**
   * used to link submodule with realTimeData
   * @type {string}
   */
  name: SUBMODULE_NAME,
  init: () => true,
  getBidRequestData,
};

function registerSubModule() {
  submodule('realTimeData', oneKeyDataSubmodule);
}

registerSubModule();
