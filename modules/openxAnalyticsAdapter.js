import includes from 'core-js-pure/features/array/includes.js';
import adapter from '../src/AnalyticsAdapter.js';
import CONSTANTS from '../src/constants.json';
import adapterManager from '../src/adapterManager.js';

//* *******  V2 Code
import { ajax } from '../src/ajax.js';

// temp dependency on zlib to minimize payload
const zlib = require('zlib');  // eslint-disable-line

const utils = require('../src/utils.js');

const urlParam = '';
const analyticsType = 'endpoint';

const ADAPTER_VERSION = '0.1';
const SCHEMA_VERSION = '0.1';

const MAX_RETRIES = 2;
const MAX_TIMEOUT = 10000;
const AUCTION_END_WAIT_TIME = 1000;

const auctionInitConst = CONSTANTS.EVENTS.AUCTION_INIT;
const auctionEndConst = CONSTANTS.EVENTS.AUCTION_END;
const bidWonConst = CONSTANTS.EVENTS.BID_WON;
const bidRequestConst = CONSTANTS.EVENTS.BID_REQUESTED;
const bidAdjustmentConst = CONSTANTS.EVENTS.BID_ADJUSTMENT;
const bidResponseConst = CONSTANTS.EVENTS.BID_RESPONSE;
const bidTimeoutConst = CONSTANTS.EVENTS.BID_TIMEOUT;
const SLOT_LOADED = 'slotOnload';

/**
 * @typedef {Object} AnalyticsConfig
 * @property {string} publisherPlatformId
 * @property {number} publisherAccountId
 * @property {number} sampling
 * @property {boolean} enableV2
 * @property {boolean} testPipeline
 * @property {Object} campaign
 * @property {string} adIdKey
 * @property {number} payloadWaitTime
 * @property {number} payloadWaitTimePadding
 * @property {Array<string>} adUnits
 */

/**
 * @type {AnalyticsConfig}
 */
const DEFAULT_ANALYTICS_CONFIG = {
  publisherPlatformId: void (0),
  publisherAccountId: void (0),
  sampling: 0.05, // default sampling rate of 5%
  testCode: 'default',
  enableV2: false,
  testPipeline: false,
  adIdKey: 'hb_adid',
  campaign: {},
  adUnits: [],
  payloadWaitTime: AUCTION_END_WAIT_TIME,
  payloadWaitTimePadding: 2000
};

let googletag = window.googletag || {};
googletag.cmd = googletag.cmd || [];

/**
 * @type {AnalyticsConfig}
 */
let analyticsConfig;

let eventStack = {};
let loadedAdSlots = {};

let localStoragePrefix = 'openx_analytics_';
let utmTags = [
  'utm_campaign',
  'utm_source',
  'utm_medium',
  'utm_term',
  'utm_content'
];

const UTM_TO_CAMPAIGN_PROPERTIES = {
  'utm_campaign': 'name',
  'utm_source': 'source',
  'utm_medium': 'medium',
  'utm_term': 'term',
  'utm_content': 'content'
};
let sessionTimeout = 60 * 60 * 1000;
let sessionIdStorageKey = 'session_id';
let sessionTimeoutKey = 'session_timeout';

function buildSessionIdLocalStorageKey() {
  return localStoragePrefix.concat(sessionIdStorageKey);
}

function buildSessionIdTimeoutLocalStorageKey() {
  return localStoragePrefix.concat(sessionTimeoutKey);
}

function updateSessionId() {
  if (isSessionIdTimeoutExpired()) {
    let newSessionId = utils.generateUUID();
    localStorage.setItem(buildSessionIdLocalStorageKey(), newSessionId);
  }
  analyticsConfig.sessionId = getSessionId();
  updateSessionIdTimeout();
}

function updateSessionIdTimeout() {
  localStorage.setItem(buildSessionIdTimeoutLocalStorageKey(), Date.now());
}

function isSessionIdTimeoutExpired() {
  let cpmSessionTimestamp = localStorage.getItem(
    buildSessionIdTimeoutLocalStorageKey()
  );
  return Date.now() - cpmSessionTimestamp > sessionTimeout;
}

function getSessionId() {
  return localStorage.getItem(buildSessionIdLocalStorageKey())
    ? localStorage.getItem(buildSessionIdLocalStorageKey())
    : '';
}

function getPublisherPlatformId() {
  if (analyticsConfig.publisherPlatformId !== undefined) {
    if (typeof analyticsConfig.publisherPlatformId === 'string') {
      if (analyticsConfig.publisherPlatformId !== '') {
        return analyticsConfig.publisherPlatformId;
      } else {
        utils.logError('OX: Invalid PublisherPlatformId');
        return null;
      }
    } else {
      utils.logError('OX: Invalid datatype for PublisherPlatformId');
      return null;
    }
  } else {
    utils.logError('OX: PublisherPlatformId not defined');
    return null;
  }
}

function getPublisherAccountId() {
  if (analyticsConfig.publisherAccountId !== undefined) {
    if (typeof analyticsConfig.publisherAccountId === 'number') {
      if (analyticsConfig.publisherAccountId > -1) {
        return analyticsConfig.publisherAccountId;
      } else {
        utils.logError('OX: Invalid PublisherAccountId');
        return null;
      }
    } else {
      utils.logError('OX: Invalid datatype for PublisherAccountId');
      return null;
    }
  } else {
    utils.logError('OX: PublisherAccountId not defined');
    return null;
  }
}

function getTestCode() {
  if (analyticsConfig.testCode !== undefined) {
    if (typeof analyticsConfig.testCode === 'string') {
      return analyticsConfig.testCode;
    } else {
      utils.logError('OX: Invalid datatype for testCode');
      return null;
    }
  } else {
    utils.logInfo('OX: testCode not defined');
    return 'default';
  }
}

function checkInitOptions() {
  let publisherPlatformId = getPublisherPlatformId();
  let publisherAccountId = getPublisherAccountId();
  let testCode = getTestCode();
  if (publisherPlatformId && publisherAccountId && testCode) {
    return true;
  }
  return false;
}

function checkAdUnitConfig() {
  if (typeof analyticsConfig.adUnits === 'undefined') {
    return false;
  }
  return analyticsConfig.adUnits.length > 0;
}

function buildEventStack(auctionId) {
  eventStack[auctionId].options = analyticsConfig;
  utils.logInfo('OX: Options Initialized', eventStack);
}

function filterBidsByAdUnit(bids) {
  var filteredBids = [];
  bids.forEach(function(bid) {
    if (includes(analyticsConfig.adUnits, bid.placementCode)) {
      filteredBids.push(bid);
    }
  });
  return filteredBids;
}

function isValidEvent(eventType, adUnitCode) {
  if (checkAdUnitConfig()) {
    let validationEvents = [bidAdjustmentConst, bidResponseConst, bidWonConst, bidTimeoutConst];
    if (
      !includes(analyticsConfig.adUnits, adUnitCode) &&
      includes(validationEvents, eventType)
    ) {
      return false;
    }
  }
  return true;
}

function isValidEventStack(auctionId) {
  utils.logInfo('OX: Validating eventStack for', auctionId)
  if (eventStack[auctionId].events.length > 0) {
    return eventStack[auctionId].events.some(function(event) {
      // utils.logInfo('OX: EventType of event ', event.eventType)
      return (
        bidRequestConst === event.eventType || bidResponseConst === event.eventType || bidAdjustmentConst === event.eventType || auctionEndConst === event.eventType || bidTimeoutConst === event.eventType
      );
    });
  }
  return false;
}

function removeads(info) {
  if (info && info.bidsReceived) {
    let newInfo = JSON.parse(JSON.stringify(info));
    let bidsReceivedArray = newInfo.bidsReceived;
    for (var index = 0; index < bidsReceivedArray.length; index++) {
      if (bidsReceivedArray[index].ad !== undefined) {
        bidsReceivedArray[index].ad = '';
      }
    }
    newInfo.bidsReceived = bidsReceivedArray;
    return newInfo;
  } else {
    return info;
  }
}

function getAuctionIdByAdId(adId) {
  let auctionId, adUnitCode;
  utils._each(eventStack, function(auctionInfo) {
    if (auctionInfo && auctionInfo.events) {
      auctionInfo.events.forEach(function(eventsInfo) {
        if (eventsInfo.eventType === bidWonConst) {
          if (eventsInfo.args && eventsInfo.args.adId && eventsInfo.args.adId === adId) {
            auctionId = eventsInfo.args.auctionId;
            adUnitCode = eventsInfo.args.adUnitCode;
          }
        }
      });
    }
  });
  return {
    auctionId: auctionId,
    adUnitCode: adUnitCode
  };
}

function getAllAdUnitCodesByAuctionId(auctionId) {
  let adUnitCodes;
  if (eventStack[auctionId] && eventStack[auctionId].events) {
    eventStack[auctionId].events.forEach(function(eventsInfo) {
      if (eventsInfo.eventType === 'auctionEnd') {
        adUnitCodes = eventsInfo.args.adUnitCodes;
      }
    })
  }
  return adUnitCodes;
}

function getAuctionIdByAdUnitCode(adUnitCode) {
  let auctionId;
  utils._map(eventStack, value => value).forEach(function(auctionInfo) {
    if (auctionId === undefined) {
      if (auctionInfo && auctionInfo.events) {
        auctionInfo.events.forEach(function(eventsInfo) {
          if (eventsInfo.eventType === auctionEndConst) {
            if (eventsInfo.args && eventsInfo.args.adUnitCodes) {
              if (eventsInfo.args.adUnitCodes.includes(adUnitCode)) {
                auctionId = eventsInfo.args.auctionId;
              }
            }
          }
        })
      }
    }
  });
  return auctionId;
}

function onSlotLoaded({ slot }) {
  const adId = slot.getTargeting('hb_adid')[0];
  const slotElementId = slot.getSlotElementId();
  const adUnitPath = slot.getAdUnitPath();

  // AdId will be present in `eventStack` only if winner is through prebid auction.
  // Assuming either `adUnitPath` or `slotElementId` to be adUnitCode because there is no other way -
  // to know for which ad unit the slot is rendered

  let auctionId, adUnitCode;
  let adUnitInfo = getAuctionIdByAdId(adId);
  if (adUnitInfo && adUnitInfo.auctionId && adUnitInfo.adUnitCode) {
    auctionId = adUnitInfo.auctionId;
    adUnitCode = adUnitInfo.adUnitCode;
  } else {
    adUnitCode = slotElementId;
    auctionId = getAuctionIdByAdUnitCode(adUnitCode);
    if (!auctionId) {
      adUnitCode = adUnitPath;
      auctionId = getAuctionIdByAdUnitCode(adUnitPath);
    }
  }

  let allSlotsLoaded = false;
  if (auctionId) {
    let {x, y} = getPageOffset();
    let adPosition = isAtf(slotElementId, x, y) ? 'ATF' : 'BTF';
    updateLoadedAdSlotsInfo(auctionId, adUnitCode, adPosition);
    let loadedAdUnitCodes = getLoadedAdUnitCodes(auctionId);
    let allAdUnitCodes = getAllAdUnitCodesByAuctionId(auctionId);
    if (loadedAdUnitCodes.length === allAdUnitCodes.length) {
      allSlotsLoaded = true;
    }
  }

  if (auctionId && eventStack[auctionId] && allSlotsLoaded) {
    setTimeout(function() {
      if (eventStack[auctionId]) {
        send(SLOT_LOADED, eventStack, auctionId);
        eventStack[auctionId] = null;
      }
      delete loadedAdSlots[auctionId];
    }, analyticsConfig.payloadWaitTime);
  }
}

let openxAdapter = Object.assign(adapter({ urlParam, analyticsType }));

openxAdapter.originEnableAnalytics = openxAdapter.enableAnalytics;

openxAdapter.enableAnalytics = function(adapterConfig = {options: {}}) {
  // Backwards compatibility for external documentation
  if (adapterConfig.options.slotLoadWaitTime) {
    adapterConfig.options.payloadWaitTime = adapterConfig.options.slotLoadWaitTime;
  }

  if (isValidConfig(adapterConfig)) {
    analyticsConfig = {...DEFAULT_ANALYTICS_CONFIG, ...adapterConfig.options};

    // campaign properties defined by config will override utm query parameters
    analyticsConfig.campaign = {...buildCampaignFromUtmCodes(), ...analyticsConfig.campaign};

    utils.logInfo('OpenX Analytics enabled with config', analyticsConfig);

    if (analyticsConfig.testPipeline) {
      openxAdapter.track = (args) => {
        prebidAnalyticsEventHandlerV1(args);
        prebidAnalyticsEventHandlerV2(args);
      };

      googletag.cmd.push(function() {
        googletag.pubads().addEventListener(SLOT_LOADED, args => {
          utils.logInfo('OX: SlotOnLoad event triggered');
          onSlotLoaded(args);
          onSlotLoadedV2(args);
        });
      });
    } else if (analyticsConfig.enableV2) {
      // override track method with v2 handlers
      openxAdapter.track = prebidAnalyticsEventHandlerV2;

      googletag.cmd.push(function() {
        googletag.pubads().addEventListener(SLOT_LOADED, args => {
          openxAdapter.track({ eventType: SLOT_LOADED, args });
          utils.logInfo('OX: SlotOnLoad event triggered');
        });
      });
    } else {
      openxAdapter.track = prebidAnalyticsEventHandlerV1;
      googletag.cmd.push(function() {
        googletag.pubads().addEventListener(SLOT_LOADED, function(args) {
          utils.logInfo('OX: SlotOnLoad event triggered');
          onSlotLoaded(args);
        });
      });
    }

    openxAdapter.originEnableAnalytics(adapterConfig);
  }

  function isValidConfig({options: analyticsOptions}) {
    const fieldValidations = [
      // tuple of property, type, required
      ['publisherPlatformId', 'string', true],
      ['publisherAccountId', 'number', true],
      ['sampling', 'number', false],
      ['enableV2', 'boolean', false],
      ['testPipeline', 'boolean', false],
      ['adIdKey', 'string', false],
      ['payloadWaitTime', 'number', false],
      ['payloadWaitTimePadding', 'number', false],
    ];

    let failedValidation = fieldValidations.find(([property, type, required]) => {
      // if required, the property has to exist
      // if property exists, type check value
      return (required && !analyticsOptions.hasOwnProperty(property)) ||
        /* eslint-disable valid-typeof */
        (analyticsOptions.hasOwnProperty(property) && typeof analyticsOptions[property] !== type);
    });
    if (failedValidation) {
      let [property, type, required] = failedValidation;

      if (required) {
        utils.logError(`OpenXAnalyticsAdapter: Expected '${property}' to exist and of type '${type}'`);
      } else {
        utils.logError(`OpenXAnalyticsAdapter: Expected '${property}' to be type '${type}'`);
      }
    }

    return !failedValidation;
  }
};

function buildCampaignFromUtmCodes() {
  let campaign = {};
  let queryParams = utils.parseQS(utils.getWindowLocation() && utils.getWindowLocation().search);

  utmTags.forEach(function(utmKey) {
    let utmValue = queryParams[utmKey];
    if (utmValue) {
      let key = UTM_TO_CAMPAIGN_PROPERTIES[utmKey];
      campaign[key] = utmValue;
    }
  });
  return campaign;
}

function buildPayload(
  data,
  eventType,
  publisherPlatformId,
  publisherAccountId,
  auctionId,
  testCode,
  sourceUrl,
  campaign
) {
  return {
    adapterVersion: ADAPTER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    data: data,
    eventType: eventType,
    publisherPlatformId: publisherPlatformId,
    publisherAccountId: publisherAccountId,
    auctionId: auctionId,
    testCode: testCode,
    sourceUrl: sourceUrl,
    campaign
  };
}

function apiCall(url, MAX_RETRIES, payload) {
  let xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (xhr.status >= 200 && xhr.status < 300) {
      utils.logInfo('OX: Data sent for event:', payload.eventType);
    } else {
      if (MAX_RETRIES == 0) {
        utils.logError('OX: Retries Exhausted, Data could not be Sent!!');
        return;
      }
      utils.logInfo('OX: Retrying ...', MAX_RETRIES);
      url = getRandomUrl(url);
      apiCall(url, MAX_RETRIES - 1, payload);
    }
  };
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/gzip');
  if (payload.publisherPlatformId) {
    xhr.setRequestHeader('PublisherPlatformId', payload.publisherPlatformId);
  }
  if (payload.publisherAccountId) {
    xhr.setRequestHeader('PublisherAccountId', payload.publisherAccountId);
  }
  if (payload.auctionId) {
    xhr.setRequestHeader('AuctionId', payload.auctionId);
  }
  xhr.setRequestHeader('Source-Url', payload.sourceUrl);
  xhr.timeout = MAX_TIMEOUT;
  xhr.send(payload.data);
}

function getRandomUrl(failedUrl) {
  let urlHead = 'https://';
  let urlTail = '.openx.net/publish/';
  let urlList = [
    'prebid-analytics',
    'prebid-analytics-2'
  ];
  let randomIndex = Math.floor(Math.random() * urlList.length);
  let randomUrl = urlHead + urlList[randomIndex] + urlTail;
  if (failedUrl) {
    if (failedUrl === randomUrl) {
      return getRandomUrl(failedUrl);
    }
    return randomUrl;
  }
  return randomUrl;
}

function detectMob() {
  if (
    navigator.userAgent.match(/Android/i) ||
    navigator.userAgent.match(/webOS/i) ||
    navigator.userAgent.match(/iPhone/i) ||
    navigator.userAgent.match(/iPad/i) ||
    navigator.userAgent.match(/iPod/i) ||
    navigator.userAgent.match(/BlackBerry/i) ||
    navigator.userAgent.match(/Windows Phone/i)
  ) {
    return true;
  } else {
    return false;
  }
}

function detectOS() {
  if (navigator.userAgent.indexOf('Android') != -1) return 'Android';
  if (navigator.userAgent.indexOf('like Mac') != -1) return 'iOS';
  if (navigator.userAgent.indexOf('Win') != -1) return 'Windows';
  if (navigator.userAgent.indexOf('Mac') != -1) return 'Macintosh';
  if (navigator.userAgent.indexOf('Linux') != -1) return 'Linux';
  if (navigator.appVersion.indexOf('X11') != -1) return 'Unix';
  return 'Others';
}

function detectBrowser() {
  var isChrome =
    /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
  var isCriOS = navigator.userAgent.match('CriOS');
  var isSafari =
    /Safari/.test(navigator.userAgent) &&
    /Apple Computer/.test(navigator.vendor);
  var isFirefox = /Firefox/.test(navigator.userAgent);
  var isIE =
    /Trident/.test(navigator.userAgent) || /MSIE/.test(navigator.userAgent);
  var isEdge = /Edge/.test(navigator.userAgent);
  if (isIE) return 'Internet Explorer';
  if (isEdge) return 'Microsoft Edge';
  if (isCriOS) return 'Chrome';
  if (isSafari) return 'Safari';
  if (isFirefox) return 'Firefox';
  if (isChrome) return 'Chrome';
  return 'Others';
}

function send(eventType, eventStack, auctionId) {
  var ua = window.navigator.userAgent;
  var sourceUrl = window.location.href;
  var sourceBrowser = detectBrowser();
  var sourceOs = detectOS();
  // utils.logInfo('OX: AuctionId', auctionId);
  pushAdPositionData(auctionId);
  var data = eventStack[auctionId];
  var publisherPlatformId = eventStack[auctionId].options.publisherPlatformId;
  var publisherAccountId = eventStack[auctionId].options.publisherAccountId;
  var testCode = eventStack[auctionId].options.testCode;
  data['user_agent'] = ua;
  data['source_url'] = sourceUrl;
  data['source_browser'] = sourceBrowser;
  data['source_os'] = sourceOs;
  if (detectMob()) {
    data['deviceType'] = 'Mobile';
  } else {
    data['deviceType'] = 'Desktop';
  }
  if (typeof data === 'object') {
    const stringData = JSON.stringify(data);
    if (typeof stringData === 'string') {
      const compressedData = zlib.gzipSync(stringData);
      let urlGenerated = getRandomUrl(null);
      let payload = buildPayload(
        compressedData,
        eventType,
        publisherPlatformId,
        publisherAccountId,
        auctionId,
        testCode,
        sourceUrl,
        analyticsConfig.campaign
      );
      apiCall(urlGenerated, MAX_RETRIES, payload);
    } else {
      utils.logError('OX: Invalid data format');
      delete eventStack[auctionId];
      // utils.logInfo('OX: Deleted Auction Info for auctionId', auctionId);
    }
  } else {
    utils.logError('OX: Invalid data format');
    delete eventStack[auctionId];
    // utils.logInfo('OX: Deleted Auction Info for auctionId', auctionId);
  }
}
function pushEvent(eventType, args, auctionId) {
  if (eventType === bidRequestConst) {
    if (checkAdUnitConfig()) {
      args.bids = filterBidsByAdUnit(args.bids);
    }
    if (args.bids.length > 0) {
      eventStack[auctionId].events.push({ eventType: eventType });
    }
  } else {
    if (isValidEvent(eventType, args.adUnitCode)) {
      eventStack[auctionId].events.push({ eventType: eventType, args: args });
    }
  }
}

function updateLoadedAdSlotsInfo(auctionId, adUnitCode, adPosition) {
  if (auctionId && adUnitCode) {
    if (!loadedAdSlots[auctionId]) {
      loadedAdSlots[auctionId] = {};
    }
    loadedAdSlots[auctionId][adUnitCode] = {};
    if (adPosition) {
      loadedAdSlots[auctionId][adUnitCode] = { adPosition: adPosition };
    }
  } else {
    utils.logWarn("OX: Couldn't update loadedAdSlots information.");
  }
}

function getLoadedAdUnitCodes(auctionId) {
  return (!auctionId || !loadedAdSlots[auctionId] || typeof loadedAdSlots[auctionId] !== 'object')
    ? [] : Object.keys(loadedAdSlots[auctionId]);
}

function pushAdPositionData(auctionId) {
  if (auctionId && eventStack && eventStack[auctionId] && eventStack[auctionId].events) {
    let adUnitPositionMap = loadedAdSlots[auctionId];
    if (adUnitPositionMap && JSON.stringify(adUnitPositionMap) !== '{}') {
      eventStack[auctionId].events.filter(function(event) {
        return event.eventType === auctionEndConst;
      }).forEach(function (auctionEndEvent) {
        if (auctionEndEvent.args && auctionEndEvent.args.adUnits) {
          auctionEndEvent.args.adUnits.forEach(function (adUnitInfo) {
            if (adUnitPositionMap[adUnitInfo.code] && adUnitPositionMap[adUnitInfo.code]['adPosition']) {
              adUnitInfo['adPosition'] = adUnitPositionMap[adUnitInfo.code]['adPosition'];
            } else {
              adUnitInfo['adPosition'] = '';
            }
          })
        }
      });
    }
  }
}

function isAtf(elementId, scrollLeft = 0, scrollTop = 0) {
  let elem = document.querySelector('#' + elementId);
  let isAtf = false;
  if (elem) {
    let bounding = elem.getBoundingClientRect();
    if (bounding) {
      let windowWidth = (window.innerWidth || document.documentElement.clientWidth);
      let windowHeight = (window.innerHeight || document.documentElement.clientHeight);

      // intersection coordinates
      let left = Math.max(0, bounding.left + scrollLeft);
      let right = Math.min(windowWidth, bounding.right + scrollLeft);
      let top = Math.max(0, bounding.top + scrollTop);
      let bottom = Math.min(windowHeight, bounding.bottom + scrollTop);

      let intersectionWidth = right - left;
      let intersectionHeight = bottom - top;

      let intersectionArea = (intersectionHeight > 0 && intersectionWidth > 0) ? (intersectionHeight * intersectionWidth) : 0;
      let adSlotArea = (bounding.right - bounding.left) * (bounding.bottom - bounding.top);

      if (adSlotArea > 0) {
        // Atleast 50% of intersection in window
        isAtf = intersectionArea * 2 >= adSlotArea;
      }
    }
  } else {
    utils.logWarn('OX: DOM element not for id ' + elementId);
  }
  return isAtf;
}

openxAdapter.slotOnLoad = onSlotLoaded;

adapterManager.registerAnalyticsAdapter({
  adapter: openxAdapter,
  code: 'openx'
});

function prebidAnalyticsEventHandlerV1({eventType, args}) {
  if (!checkInitOptions()) {
    send(eventType, {}, null);
    return;
  }

  let info = Object.assign({}, args);

  if (info && info.ad) {
    info.ad = '';
  }

  // on bid timeout events, the info is an array of bids
  let auctionId = eventType === CONSTANTS.EVENTS.BID_TIMEOUT
    ? info[0].auctionId
    : info.auctionId;

  if (eventType === auctionInitConst) {
    eventStack[auctionId] = { options: {}, events: [] };
    // utils.logInfo('OX: Event Stack updated after AuctionInit', eventStack);
  } else if (eventType === bidWonConst) {
    pushEvent(eventType, info, auctionId);
    // utils.logInfo('OX: Bid won called for', auctionId);
  } else if (eventType === auctionEndConst) {
    pushEvent(eventType, removeads(info), auctionId);
    // utils.logInfo('OX: Auction end called for', auctionId);
    updateSessionId();
    buildEventStack(auctionId);
    if (isValidEventStack(auctionId)) {
      setTimeout(function() {
        // utils.logInfo('OX: Sending data', eventStack);
        if (eventStack[auctionId]) {
          send(
            eventType,
            eventStack,
            auctionId
          );
          eventStack[auctionId] = null;
        }
        delete loadedAdSlots[auctionId];
        // utils.logInfo('OX: Deleted Auction Info for auctionId', auctionId);
      }, analyticsConfig.payloadWaitTime);
    } else {
      setTimeout(function() {
        eventStack[auctionId] = null;
        // utils.logInfo('OX: Deleted Auction Info for auctionId', auctionId);
      }, analyticsConfig.payloadWaitTime);
    }
  } else if (eventType === bidTimeoutConst) {
    // utils.logInfo('SA: Bid Timedout for', auctionId);
    pushEvent(eventType, info, auctionId);
  }
}

//* *******  V2 Code  *******
const {
  EVENTS: { AUCTION_INIT, BID_REQUESTED, BID_RESPONSE, BID_TIMEOUT, AUCTION_END, BID_WON }
} = CONSTANTS;

export const AUCTION_STATES = {
  INIT: 'initialized', // auction has initialized
  ENDED: 'ended', // all auction requests have been accounted for
  COMPLETED: 'completed' // all slots have rendered
};

const ENDPOINT = 'https://prebid.openx.net/ox/analytics';
let auctionMap = {};
let auctionOrder = 1; // tracks the number of auctions ran on the page

function prebidAnalyticsEventHandlerV2({eventType, args}) {
  utils.logMessage(eventType, Object.assign({}, args));
  switch (eventType) {
    case AUCTION_INIT:
      onAuctionInit(args);
      break;
    case BID_REQUESTED:
      onBidRequested(args);
      break;
    case BID_RESPONSE:
      onBidResponse(args);
      break;
    case BID_TIMEOUT:
      onBidTimeout(args);
      break;
    case AUCTION_END:
      onAuctionEnd(args);
      break;
    case BID_WON:
      onBidWon(args);
      break;
    case SLOT_LOADED:
      onSlotLoadedV2(args);
      break;
  }
}

/**
 * @typedef {Object} PbAuction
 * @property {string} auctionId - Auction ID of the request this bid responded to
 * @property {number} timestamp //: 1586675964364
 * @property {number} auctionEnd - timestamp of when auction ended //: 1586675964364
 * @property {string} auctionStatus //: "inProgress"
 * @property {Array<Adunit>} adUnits //: [{…}]
 * @property {string} adUnitCodes //: ["video1"]
 * @property {string} labels //: undefined
 * @property {Array<BidRequest>} bidderRequests //: (2) [{…}, {…}]
 * @property {Array<BidRequest>} noBids //: []
 * @property {Array<BidResponse>} bidsReceived //: []
 * @property {Array<BidResponse>} winningBids //: []
 * @property {number} timeout //: 3000
 * @property {Object} config //: {publisherPlatformId: "a3aece0c-9e80-4316-8deb-faf804779bd1", publisherAccountId: 537143056, sampling: 1, enableV2: true}/*
 */

function onAuctionInit({auctionId, timestamp: startTime, timeout, adUnitCodes}) {
  auctionMap[auctionId] = {
    id: auctionId,
    startTime,
    endTime: void (0),
    timeout,
    auctionOrder,
    userIds: [],
    adUnitCodesCount: adUnitCodes.length,
    adunitCodesRenderedCount: 0,
    state: AUCTION_STATES.INIT,
    auctionSendDelayTimer: void (0),
  };

  // setup adunit properties in map
  auctionMap[auctionId].adUnitCodeToAdUnitMap = adUnitCodes.reduce((obj, adunitCode) => {
    obj[adunitCode] = {
      code: adunitCode,
      adPosition: void (0),
      bidRequestsMap: {}
    };
    return obj;
  }, {});

  auctionOrder++;
}

/**
 * @typedef {Object} PbBidRequest
 * @property {string} auctionId - Auction ID of the request this bid responded to
 * @property {number} auctionStart //: 1586675964364
 * @property {Object} refererInfo
 * @property {PbBidderRequest} bids
 * @property {number} start - Start timestamp of the bidder request
 *
 */

/**
 * @typedef {Object} PbBidderRequest
 * @property {string} adUnitCode - Name of div or google adunit path
 * @property {string} bidder - Bame of bidder
 * @property {string} bidId - Identifies the bid request
 * @property {Object} mediaTypes
 * @property {Object} params
 * @property {string} src
 * @property {Object} userId - Map of userId module to module object
 */

/**
 * Tracks the bid request
 * @param {PbBidRequest} bidRequest
 */
function onBidRequested(bidRequest) {
  const {auctionId, bids: bidderRequests, start} = bidRequest;
  const auction = auctionMap[auctionId];
  const adUnitCodeToAdUnitMap = auction.adUnitCodeToAdUnitMap;

  bidderRequests.forEach(bidderRequest => {
    const { adUnitCode, bidder, bidId: requestId, mediaTypes, params, src, userId } = bidderRequest;

    auction.userIds.push(userId);
    adUnitCodeToAdUnitMap[adUnitCode].bidRequestsMap[requestId] = {
      bidder,
      params,
      mediaTypes,
      source: src,
      startTime: start,
      timedOut: false,
      bids: {}
    };
  });
}

/**
 *
 * @param {BidResponse} bidResponse
 */
function onBidResponse(bidResponse) {
  let {
    auctionId,
    adUnitCode,
    requestId,
    cpm,
    creativeId,
    requestTimestamp,
    responseTimestamp,
    ts,
    mediaType,
    dealId,
    ttl,
    netRevenue,
    currency,
    originalCpm,
    originalCurrency,
    width,
    height,
    timeToRespond: latency,
    adId,
    meta
  } = bidResponse;

  auctionMap[auctionId].adUnitCodeToAdUnitMap[adUnitCode].bidRequestsMap[requestId].bids[adId] = {
    cpm,
    creativeId,
    requestTimestamp,
    responseTimestamp,
    ts,
    adId,
    meta,
    mediaType,
    dealId,
    ttl,
    netRevenue,
    currency,
    originalCpm,
    originalCurrency,
    width,
    height,
    latency,
    winner: false,
    rendered: false,
    renderTime: 0,
  };
}

function onBidTimeout(args) {
  utils._each(args, ({auctionId, adUnitCode, bidId: requestId}) => {
    if (auctionMap[auctionId] &&
      auctionMap[auctionId].adUnitCodeToAdUnitMap &&
      auctionMap[auctionId].adUnitCodeToAdUnitMap[adUnitCode] &&
      auctionMap[auctionId].adUnitCodeToAdUnitMap[adUnitCode].bidRequestsMap[requestId]
    ) {
      auctionMap[auctionId].adUnitCodeToAdUnitMap[adUnitCode].bidRequestsMap[requestId].timedOut = true;
    }
  });
}
/**
 *
 * @param {PbAuction} endedAuction
 */
function onAuctionEnd(endedAuction) {
  let auction = auctionMap[endedAuction.auctionId];

  if (!auction) {
    return;
  }

  clearAuctionTimer(auction);
  auction.endTime = endedAuction.auctionEnd;
  auction.state = AUCTION_STATES.ENDED;
  delayedSend(auction);
}

/**
 *
 * @param {BidResponse} bidResponse
 */
function onBidWon(bidResponse) {
  const { auctionId, adUnitCode, requestId, adId } = bidResponse;
  if (auctionMap[auctionId] &&
    auctionMap[auctionId].adUnitCodeToAdUnitMap &&
    auctionMap[auctionId].adUnitCodeToAdUnitMap[adUnitCode] &&
    auctionMap[auctionId].adUnitCodeToAdUnitMap[adUnitCode].bidRequestsMap[requestId] &&
    auctionMap[auctionId].adUnitCodeToAdUnitMap[adUnitCode].bidRequestsMap[requestId].bids[adId]
  ) {
    auctionMap[auctionId].adUnitCodeToAdUnitMap[adUnitCode].bidRequestsMap[requestId].bids[adId].winner = true;
  }
}

/**
 *
 * @param {GoogleTagSlot} slot
 * @param {string} serviceName
 */
function onSlotLoadedV2({ slot }) {
  const renderTime = Date.now();
  const elementId = slot.getSlotElementId();
  const bidId = slot.getTargeting('hb_adid')[0];

  let [auction, adUnit, bid] = getPathToBidResponseByBidId(bidId);

  if (!auction) {
    // attempt to get auction by adUnitCode
    auction = getAuctionByGoogleTagSLot(slot);

    if (!auction) {
      return; // slot is not participating in an active prebid auction
    }
  }

  clearAuctionTimer(auction);

  // track that an adunit code has completed within an auction
  auction.adunitCodesRenderedCount++;

  // mark adunit as rendered
  if (bid) {
    let {x, y} = getPageOffset();
    bid.rendered = true;
    bid.renderTime = renderTime;
    adUnit.adPosition = isAtf(elementId, x, y) ? 'ATF' : 'BTF';
  }

  if (auction.adunitCodesRenderedCount === auction.adUnitCodesCount) {
    auction.state = AUCTION_STATES.COMPLETED;
  }

  // prepare to send regardless if auction is complete or not as a failsafe in case not all events are tracked
  // add additional padding when not all slots are rendered
  delayedSend(auction);
}

// backwards compatible pageOffset from https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollX
function getPageOffset() {
  var x = (window.pageXOffset !== undefined)
    ? window.pageXOffset
    : (document.documentElement || document.body.parentNode || document.body).scrollLeft;

  var y = (window.pageYOffset !== undefined)
    ? window.pageYOffset
    : (document.documentElement || document.body.parentNode || document.body).scrollTop;
  return {x, y};
}

function delayedSend(auction) {
  const delayTime = auction.adunitCodesRenderedCount === auction.adUnitCodesCount
    ? analyticsConfig.payloadWaitTime
    : analyticsConfig.payloadWaitTime + analyticsConfig.payloadWaitTimePadding;

  auction.auctionSendDelayTimer = setTimeout(() => {
    let payload = JSON.stringify([buildAuctionPayload(auction)]);
    ajax(ENDPOINT, deleteAuctionMap, payload, { contentType: 'application/json' });

    function deleteAuctionMap() {
      delete auctionMap[auction.id];
    }
  }, delayTime);
}

function clearAuctionTimer(auction) {
  // reset the delay timer to send the auction data
  if (auction.auctionSendDelayTimer) {
    clearTimeout(auction.auctionSendDelayTimer);
    auction.auctionSendDelayTimer = void (0);
  }
}

/**
 * Returns the path to a bid (auction, adunit, bidRequest, and bid) based on a bidId
 * @param {string} bidId
 * @returns {Array<*>}
 */
function getPathToBidResponseByBidId(bidId) {
  let auction;
  let adUnit;
  let bidResponse;

  if (!bidId) {
    return [];
  }

  utils._each(auctionMap, currentAuction => {
    // skip completed auctions
    if (currentAuction.state === AUCTION_STATES.COMPLETED) {
      return;
    }

    utils._each(currentAuction.adUnitCodeToAdUnitMap, (currentAdunit) => {
      utils._each(currentAdunit.bidRequestsMap, currentBiddRequest => {
        utils._each(currentBiddRequest.bids, (currentBidResponse, bidResponseId) => {
          if (bidId === bidResponseId) {
            auction = currentAuction;
            adUnit = currentAdunit;
            bidResponse = currentBidResponse;
          }
        });
      });
    });
  });
  return [auction, adUnit, bidResponse];
}

function getAuctionByGoogleTagSLot(slot) {
  let slotAdunitCodes = [slot.getSlotElementId(), slot.getAdUnitPath()];
  let slotAuction;

  utils._each(auctionMap, auction => {
    if (auction.state === AUCTION_STATES.COMPLETED) {
      return;
    }

    utils._each(auction.adUnitCodeToAdUnitMap, (bidderRequestIdMap, adUnitCode) => {
      if (slotAdunitCodes.includes(adUnitCode)) {
        slotAuction = auction;
      }
    });
  });

  return slotAuction;
}

function buildAuctionPayload(auction) {
  let {startTime, endTime, state, timeout, auctionOrder, userIds, adUnitCodeToAdUnitMap} = auction;
  let {publisherPlatformId, publisherAccountId, campaign} = analyticsConfig;

  return {
    publisherPlatformId,
    publisherAccountId,
    campaign,
    state,
    startTime,
    endTime,
    timeLimit: timeout,
    auctionOrder,
    deviceType: detectMob() ? 'Mobile' : 'Desktop',
    deviceOSType: detectOS(),
    browser: detectBrowser(),
    testCode: analyticsConfig.testCode,
    // return an array of module name that have user data
    hasUserData: buildHasUserDataPayload(userIds),
    adUnits: buildAdUnitsPayload(adUnitCodeToAdUnitMap),
  };

  function buildAdUnitsPayload(adUnitCodeToAdUnitMap) {
    return utils._map(adUnitCodeToAdUnitMap, (adUnit) => {
      let {code, adPosition} = adUnit;

      return {
        code,
        adPosition,
        bidRequests: buildBidRequestPayload(adUnit.bidRequestsMap)
      };

      function buildBidRequestPayload(bidRequestsMap) {
        return utils._map(bidRequestsMap, (bidRequest) => {
          let {bidder, source, bids, mediaTypes, timedOut} = bidRequest;
          return {
            bidder,
            source,
            hasBidderResponded: Object.keys(bids).length > 0,
            availableAdSizes: getMediaTypeSizes(mediaTypes),
            availableMediaTypes: getMediaTypes(mediaTypes),
            timedOut,
            bidResponses: utils._map(bidRequest.bids, (bidderBidResponse) => {
              let {
                cpm,
                creativeId,
                ts,
                meta,
                mediaType,
                dealId,
                ttl,
                netRevenue,
                currency,
                width,
                height,
                latency,
                winner,
                rendered,
                renderTime
              } = bidderBidResponse;

              return {
                microCpm: cpm * 1000000,
                netRevenue,
                currency,
                mediaType,
                height,
                width,
                size: `${width}x${height}`,
                dealId,
                latency,
                ttl,
                winner,
                creativeId,
                ts,
                rendered,
                renderTime,
                meta
              }
            })
          }
        });
      }
    });
  }

  function buildHasUserDataPayload(userIds) {
    return utils._map(userIds, (userId) => {
      return utils._map(userId, (id, module) => {
        return hasUserData(module, id) ? module : false
      }).filter(module => module);
    }).reduce(utils.flatten, []).filter(utils.uniques).sort();
  }

  function hasUserData(module, idOrIdObject) {
    let normalizedId;

    switch (module) {
      case 'digitrustid':
        normalizedId = utils.deepAccess(idOrIdObject, 'data.id');
        break;
      case 'lipb':
        normalizedId = idOrIdObject.lipbid;
        break;
      default:
        normalizedId = idOrIdObject;
    }

    return !utils.isEmpty(normalizedId);
  }

  function getMediaTypeSizes(mediaTypes) {
    return utils._map(mediaTypes, (mediaTypeConfig, mediaType) => {
      return utils.parseSizesInput(mediaTypeConfig.sizes)
        .map(size => `${mediaType}_${size}`);
    }).flat();
  }

  function getMediaTypes(mediaTypes) {
    return utils._map(mediaTypes, (mediaTypeConfig, mediaType) => mediaType);
  }
}

export default Object.assign({
  adapter: openxAdapter,
  auctionEndWaitTime: AUCTION_END_WAIT_TIME
});

/**
 * Test Helper Functions
 */

// reset the cache for unit tests
openxAdapter.reset = function() {
  // V1 data
  eventStack = {};
  loadedAdSlots = {};

  // V2 data
  auctionMap = {};
  auctionOrder = 1;
};

/**
 *  Type Definitions
 */

/**
 * @typedef {Object} BidResponse
 * @property {string} auctionId - Auction ID of the request this bid responded to
 * @property {string} bidderCode - The bidder code. Used by ad server’s line items to identify bidders
 * @property {string} adId - The unique identifier of a bid creative. It’s used by the line item’s creative as in this example.
 * @property {number} width - The width of the returned creative size.
 * @property {number} height - The height of the returned creative size.
 * @property {string} size - The width x height of the returned creative size.
 * @property {number} originalCpm - The original bid price from the bidder prior to bid adjustments
 * @property {number} cpm - The exact bid price from the bidder
 * @property {string} originalCurrency - Original currency of the bid prior to bid adjustments
 * @property {string} currency - 3-letter ISO 4217 code defining the currency of the bid.
 * @property {Boolean} netRevenue - True if bid is Net, False if Gross
 * @property {number} requestTimestamp - The time stamp when the bid request is sent out in milliseconds
 * @property {number} responseTimestamp - The time stamp when the bid response is received in milliseconds
 * @property {number} timeToRespond - The amount of time for the bidder to respond with the bid
 * @property {string} adUnitCode - adUnitCode to get the bid responses for
 * @property {number} creativeId - Bidder-specific creative ID
 * @property {string} mediaType - One of: banner, native, video banner
 * @property {string} [dealId] - (Optional) If the bid is associated with a Deal, this field contains the deal ID.
 * @property {Object} adserverTargeting - Contains all the adserver targeting parameters
 * @property {string} [ad] - Contains the ad payload for banner ads.
 * @property {string} [vastUrl] - URL where the VAST document can be retrieved when ready for display.
 * @property {string} [vastImpUrl] - Optional; only usable with vastUrl and requires prebid cache to be enabled.
 *                                   An impression tracking URL to serve with video Ad
 * @property {string} [vastXml] - XML for VAST document to be cached for later retrieval.
 * @property {Object} [native] - Contains native key value pairs.
 * @property {string} status - Status of the bid. Possible values: targetingSet, rendered "targetingSet"
 * @property {string} statusMessage - The bid’s status message “Bid returned empty or error response” or “Bid available”
 * @property {number} ttl - How long (in seconds) this bid is considered valid. See this FAQ entry for more info. 300
 * @property {string} requestId - Used to tie this bid back to the request
 * @property {string} mediaType - Specifies the type of media type. One of: banner, video, native
 * @property {string} source - Whether this bid response came from a client-side or server side request.  One of: client, server.
 * @property {string} pbLg - CPM quantized to a granularity: Low (pbLg)
 * @property {string} pbMg - CPM quantized to a granularity: Medium (pbMg)
 * @property {string} pbHg - CPM quantized to a granularity: High (pbHg)
 * @property {string} pbAg - CPM quantized to a granularity: Auto (pbAg)
 * @property {string} pbDg - CPM quantized to a granularity: Dense (pbDg)
 * @property {BidResponseMeta} [meta] - Object containing metadata about the bid
 * }}
 */

/**
 * @typedef {Object} BidResponseMeta
 * @property {string} [networkId] Bidder-specific Network/DSP Id
 * @property {string} [networkName] - Network/DSP Name. example: "NetworkN"
 * @property {string} [agencyId] - Bidder-specific Agency ID. example: 2222
 * @property {string} [agencyName] - Agency Name. example: "Agency, Inc."
 * @property {string} [advertiserId] - Bidder-specific Advertiser ID. example: 3333
 * @property {string} [advertiserName] - Advertiser Name. example: "AdvertiserA"
 * @property {Array<string>} [advertiserDomains] - Array of Advertiser Domains for the landing page(s). This is an array
 *                                             to align with the OpenRTB ‘adomain’ field.. example: ["advertisera.com"]
 * @property {string} [brandId] - Bidder-specific Brand ID (some advertisers may have many brands). example: 4444
 * @property {string} [brandName] - Brand Name. example: "BrandB"
 * @property {string} [primaryCatId] - Primary IAB category ID. example: "IAB-111"
 * @property {Array<string>} [secondaryCatIds] - Array of secondary IAB category IDs. example: ["IAB-222","IAB-333"]
 */
