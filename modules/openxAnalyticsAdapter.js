import includes from 'core-js/library/fn/array/includes.js';
import adapter from '../src/AnalyticsAdapter.js';
import CONSTANTS from '../src/constants.json';
import adapterManager from '../src/adapterManager.js';

// temp dependency on zlib to minimize payload
const zlib = require('zlib');  // eslint-disable-line

const utils = require('../src/utils.js');

const urlParam = '';
const analyticsType = 'endpoint';

const ADAPTER_VERSION = '0.1';
const SCHEMA_VERSION = '0.1';

const MAX_RETRIES = 2;
const MAX_TIMEOUT = 10000;
const AUCTION_END_WAIT_TIME = 2000;
const DEFAULT_SLOT_LOAD_BUFFER_TIME = 100;

const auctionInitConst = CONSTANTS.EVENTS.AUCTION_INIT;
const auctionEndConst = CONSTANTS.EVENTS.AUCTION_END;
const bidWonConst = CONSTANTS.EVENTS.BID_WON;
const bidRequestConst = CONSTANTS.EVENTS.BID_REQUESTED;
const bidAdjustmentConst = CONSTANTS.EVENTS.BID_ADJUSTMENT;
const bidResponseConst = CONSTANTS.EVENTS.BID_RESPONSE;
const bidTimeoutConst = CONSTANTS.EVENTS.BID_TIMEOUT;
const SLOT_LOADED = "slotOnload"

let googletag = window.googletag || {};
googletag.cmd = googletag.cmd || [];

let initOptions = {
  publisherPlatformId: '',
  publisherAccountId: -1,
  testCode: 'default',
  utmTagData: [],
  adUnits: [],
  slotLoadWaitTime: 0
};
let eventStack = {};
let loadedAdSlots = {};

let localStoragePrefix = 'openx_analytics_';
let utmTags = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content'
];
let utmTimeoutKey = 'utm_timeout';
let utmTimeout = 60 * 60 * 1000;
let sessionTimeout = 60 * 60 * 1000;
let sessionIdStorageKey = 'session_id';
let sessionTimeoutKey = 'session_timeout';

function getParameterByName(param) {
  let vars = {};
  window.location.href
    .replace(location.hash, '')
    .replace(/[?&]+([^=&]+)=?([^&]*)?/gi, function(m, key, value) {
      vars[key] = value !== undefined ? value : '';
    });

  return vars[param] ? vars[param] : '';
}

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
  initOptions.sessionId = getSessionId();
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

function updateUtmTimeout() {
  localStorage.setItem(buildUtmLocalStorageTimeoutKey(), Date.now());
}

function isUtmTimeoutExpired() {
  let utmTimestamp = localStorage.getItem(buildUtmLocalStorageTimeoutKey());
  return Date.now() - utmTimestamp > utmTimeout;
}

function buildUtmLocalStorageTimeoutKey() {
  return localStoragePrefix.concat(utmTimeoutKey);
}

function buildUtmLocalStorageKey(utmMarkKey) {
  return localStoragePrefix.concat(utmMarkKey);
}

function getPublisherPlatformId() {
  if (initOptions.publisherPlatformId !== undefined) {
    if (typeof initOptions.publisherPlatformId === 'string') {
      if (initOptions.publisherPlatformId !== '') {
        return initOptions.publisherPlatformId;
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
  if (initOptions.publisherAccountId !== undefined) {
    if (typeof initOptions.publisherAccountId === 'number') {
      if (initOptions.publisherAccountId > -1) {
        return initOptions.publisherAccountId;
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
  if (initOptions.testCode !== undefined) {
    if (typeof initOptions.testCode === 'string') {
      return initOptions.testCode;
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
  if (typeof initOptions.adUnits === 'undefined') {
    return false;
  }
  return initOptions.adUnits.length > 0;
}

function buildEventStack(auctionId) {
  eventStack[auctionId].options = initOptions;
  utils.logInfo('OX: Options Initialized', eventStack);
}

function filterBidsByAdUnit(bids) {
  var filteredBids = [];
  bids.forEach(function(bid) {
    if (includes(initOptions.adUnits, bid.placementCode)) {
      filteredBids.push(bid);
    }
  });
  return filteredBids;
}

function isValidEvent(eventType, adUnitCode) {
  if (checkAdUnitConfig()) {
    let validationEvents = [bidAdjustmentConst, bidResponseConst, bidWonConst, bidTimeoutConst];
    if (
      !includes(initOptions.adUnits, adUnitCode) &&
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

  let auctionId;
  utils._map(eventStack, value => value).forEach( function(auctionInfo) {
    if(auctionInfo && auctionInfo.events){
      let bidWonEvent;
      bidWonEvent = auctionInfo.events.filter(function(eventsInfo) {
        return eventsInfo.eventType === "bidWon";
      });

      if(bidWonEvent.length > 0) {
        bidWonEvent.forEach(function(bidWon) {
          if(bidWon.args && bidWon.args.adId && bidWon.args.adId === adId) {
            auctionId = bidWon.args.auctionId;
          }
        }); 
      }
    }
  });
  return auctionId;
}

function getAllAdUnitCodesByAuctionId(auctionId) {

  let adUnitCodes;
  if(eventStack[auctionId] && eventStack[auctionId].events) {

    eventStack[auctionId].events.forEach(function(eventsInfo) {
      if(eventsInfo.eventType === "auctionEnd") {
        adUnitCodes = eventsInfo.args.adUnitCodes;
      }
    })
  }
  return adUnitCodes;
}

function getAuctionIdByAdUnitCode(adUnitCode) {
  let auctionId;
  utils._map(eventStack, value => value).forEach( function(auctionInfo) {
    if(auctionId === undefined) {
      if(auctionInfo && auctionInfo.events) {
        auctionInfo.events.forEach(function(eventsInfo){
          if(eventsInfo.eventType === auctionEndConst) {
            if(eventsInfo.args && eventsInfo.args.adUnitCodes) {
              if(eventsInfo.args.adUnitCodes.includes(adUnitCode)){
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

  let auctionId = getAuctionIdByAdId(adId);
  if(!auctionId) {
    auctionId = getAuctionIdByAdUnitCode(slotElementId);
    if(!auctionId) {
      auctionId = getAuctionIdByAdUnitCode(adUnitPath);
    }
  }

  let allSlotsLoaded = false;
  if(auctionId) {
    if(!loadedAdSlots[auctionId]) {
      loadedAdSlots[auctionId] = []
    }
    loadedAdSlots[auctionId].push(slotElementId);
    let allAdUnitCodes = getAllAdUnitCodesByAuctionId(auctionId);
    if(loadedAdSlots[auctionId].length === allAdUnitCodes.length) {
      allSlotsLoaded = true;
    }
  }

  if(auctionId && eventStack[auctionId] && allSlotsLoaded) {
    setTimeout(function(){
      if(eventStack[auctionId]) {
        send(SLOT_LOADED, eventStack, auctionId);
        eventStack[auctionId] = null;
      }
      delete loadedAdSlots[auctionId];
    }, initOptions.slotLoadWaitTime);
  }
}

googletag.cmd.push(function() {
  googletag.pubads().addEventListener(SLOT_LOADED, function(args) {
    utils.logInfo("OX: SlotOnLoad event triggered");
    onSlotLoaded(args);
  });
});

let openxAdapter = Object.assign(adapter({ urlParam, analyticsType }), {
  track({ eventType, args }) {

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
            if(eventStack[auctionId]) {
              send(
                eventType,
                eventStack,
                auctionId
              );
              eventStack[auctionId] = null;
            }
            delete loadedAdSlots[auctionId];
            // utils.logInfo('OX: Deleted Auction Info for auctionId', auctionId);
          }, AUCTION_END_WAIT_TIME);
        } else {
          setTimeout(function() {
            eventStack[auctionId] = null;
            // utils.logInfo('OX: Deleted Auction Info for auctionId', auctionId);
          }, AUCTION_END_WAIT_TIME);
        }
    } else if (eventType === bidTimeoutConst) {
      // utils.logInfo('SA: Bid Timedout for', auctionId);
      pushEvent(eventType, info, auctionId);
    } 
  }
});

openxAdapter.originEnableAnalytics = openxAdapter.enableAnalytics;

openxAdapter.enableAnalytics = function(config) {
  initOptions = config.options;
  initOptions.testCode = getTestCode();
  initOptions.utmTagData = this.buildUtmTagData();
  
  if(!initOptions.slotLoadWaitTime) {
    initOptions.slotLoadWaitTime = DEFAULT_SLOT_LOAD_BUFFER_TIME
  }
  utils.logInfo('OpenX Analytics enabled with config', initOptions);

  // set default sampling rate to 5%
  config.options.sampling = config.options.sampling || 0.05;
  openxAdapter.originEnableAnalytics(config);
};

openxAdapter.buildUtmTagData = function() {
  let utmTagData = {};
  let utmTagsDetected = false;
  utmTags.forEach(function(utmTagKey) {
    let utmTagValue = getParameterByName(utmTagKey);
    if (utmTagValue !== '') {
      utmTagsDetected = true;
    }
    utmTagData[utmTagKey] = utmTagValue;
  });
  utmTags.forEach(function(utmTagKey) {
    if (utmTagsDetected) {
      localStorage.setItem(
        buildUtmLocalStorageKey(utmTagKey),
        utmTagData[utmTagKey]
      );
      updateUtmTimeout();
    } else {
      if (!isUtmTimeoutExpired()) {
        utmTagData[utmTagKey] = localStorage.getItem(
          buildUtmLocalStorageKey(utmTagKey)
        )
          ? localStorage.getItem(buildUtmLocalStorageKey(utmTagKey))
          : '';
        updateUtmTimeout();
      }
    }
  });
  return utmTagData;
};

function buildPayload(
  data,
  eventType,
  publisherPlatformId,
  publisherAccountId,
  auctionId,
  testCode,
  sourceUrl
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
    sourceUrl: sourceUrl
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
        sourceUrl
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
adapterManager.registerAnalyticsAdapter({
  adapter: openxAdapter,
  code: 'openx'
});

export default openxAdapter;
