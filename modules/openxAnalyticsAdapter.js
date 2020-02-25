import includes from 'core-js/library/fn/array/includes';
import adapter from '../src/AnalyticsAdapter';
import CONSTANTS from '../src/constants.json';
import adapterManager from '../src/adapterManager';
import { type } from 'os';

const zlib = require('zlib');
const utils = require('../src/utils');

const urlParam = '';
const analyticsType = 'endpoint';

const MAX_RETRIES = 2;
const MAX_TIMEOUT = 10000;
const AUCTION_END_WAIT_TIME = 2000;

const auctionInitConst = CONSTANTS.EVENTS.AUCTION_INIT;
const auctionEndConst = CONSTANTS.EVENTS.AUCTION_END;
const bidWonConst = CONSTANTS.EVENTS.BID_WON;
const bidRequestConst = CONSTANTS.EVENTS.BID_REQUESTED;
const bidAdjustmentConst = CONSTANTS.EVENTS.BID_ADJUSTMENT;
const bidResponseConst = CONSTANTS.EVENTS.BID_RESPONSE;
const bidTimeoutConst = CONSTANTS.EVENTS.BID_TIMEOUT;

let initOptions = {
  publisherPlatformId: '',
  publisherAccountId: -1,
  utmTagData: [],
  adUnits: []
};
let bidWon = { options: {}, events: [] };
let eventStack = { options: {}, events: [] };

let auctionStatus = 'not_started';

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
function checkPublisherPlatformId() {
  if (initOptions.publisherPlatformId !== undefined) {
    if (typeof initOptions.publisherPlatformId === 'string') {
      if (initOptions.publisherPlatformId !== '') {
        return initOptions.publisherPlatformId;
      } else {
        utils.logError('SOX: Invalid PublisherPlatformId');
        return null;
      }
    } else {
      utils.logError('SOX: Invalid datatype for PublisherPlatformId');
      return null;
    }
  } else {
    utils.logError('SOX : PublisherPlatformId not defined');
    return null;
  }
}
function checkPublisherAccountId() {
  if (initOptions.publisherAccountId !== undefined) {
    if (typeof initOptions.publisherAccountId === 'number') {
      if (initOptions.publisherAccountId > -1) {
        return initOptions.publisherAccountId;
      } else {
        utils.logError('SOX: Invalid PublisherAccountId');
        return null;
      }
    } else {
      utils.logError('SOX: Invalid datatype for PublisherAccountId');
      return null;
    }
  } else {
    utils.logError('SOX : PublisherAccountId not defined');
    return null;
  }
}

function checkInitOptions() {
  let publisherPlatformId = checkPublisherPlatformId();
  let publisherAccountId = checkPublisherAccountId();
  if (publisherPlatformId && publisherAccountId) {
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

function buildEventStack() {
  eventStack.options = initOptions;
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

function isValidEventStack() {
  if (eventStack.events.length > 0) {
    return eventStack.events.some(function(event) {
      return (
        bidRequestConst === event.eventType || bidWonConst === event.eventType
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

let openxAdapter = Object.assign(adapter({ urlParam, analyticsType }), {
  track({ eventType, args }) {
    if (!checkInitOptions()) {
      send(eventType, {}, null, null);
      return;
    }

    let info = Object.assign({}, args);

    if (info && info.ad) {
      info.ad = '';
    }

    if (eventType === auctionInitConst) {
      auctionStatus = 'started';
    }

    if (eventType === bidWonConst && auctionStatus === 'not_started') {
      pushEvent(eventType, info);
      utils.logInfo('SOX:Bid won called... ');
      return;
    }

    if (eventType === auctionEndConst) {
      pushEvent(eventType, removeads(info));
      utils.logInfo('SOX:Auction end called... ');
      updateSessionId();
      buildEventStack();
      if (isValidEventStack()) {
        auctionStatus = 'not_started';
        setTimeout(function() {
          let publisherPlatformId = eventStack.options.publisherPlatformId;
          let publisherAccountId = eventStack.options.publisherAccountId;
          send(eventType, eventStack, publisherPlatformId, publisherAccountId);
        }, AUCTION_END_WAIT_TIME);
      }
    } else if (eventType === bidRequestConst || eventType === bidTimeoutConst) {
      pushEvent(eventType, info);
    }
  }
});

openxAdapter.originEnableAnalytics = openxAdapter.enableAnalytics;

openxAdapter.enableAnalytics = function(config) {
  initOptions = config.options;
  initOptions.utmTagData = this.buildUtmTagData();
  utils.logInfo('OpenX Analytics enabled with config', initOptions);
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
  sourceUrl
) {
  return {
    data: data,
    eventType: eventType,
    publisherPlatformId: publisherPlatformId,
    publisherAccountId: publisherAccountId,
    sourceUrl: sourceUrl
  };
}
function apiCall(url, MAX_RETRIES, payload) {
  let xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (xhr.status >= 200 && xhr.status < 300) {
      utils.logInfo('SOX: Data sent for event :', payload.eventType);
    } else {
      if (MAX_RETRIES == 0) {
        utils.logError('SOX:Retries Exhausted, Data could not be Sent!!');
        return;
      }
      utils.logInfo('SOX:Retrying.....', MAX_RETRIES);
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
  xhr.setRequestHeader('Source-Url', payload.sourceUrl);
  xhr.timeout = MAX_TIMEOUT;
  xhr.send(payload.data);
}

function getRandomUrl(failedUrl) {
  let urlHead = 'http://';
  let urlTail = '.sigmoid.io/publish/';
  let urlList = [
    'sox-prebid',
    'sox-prebid-1',
    'sox-prebid-2',
    'sox-prebid-3',
    'sox-prebid-4'
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

function send(eventType, data, publisherPlatformId, publisherAccountId) {
  var ua = window.navigator.userAgent;
  var sourceUrl = window.location.href;
  var sourceBrowser = detectBrowser();
  var sourceOs = detectOS();
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
    console.log(stringData);
    if (typeof stringData === 'string') {
      const compressedData = zlib.gzipSync(stringData);
      let urlGenerated = getRandomUrl(null);
      let payload = buildPayload(
        compressedData,
        eventType,
        publisherPlatformId,
        publisherAccountId,
        sourceUrl
      );
      apiCall(urlGenerated, MAX_RETRIES, payload);
    } else {
      utils.logError('SOX:Invalid data format');
      return;
    }
  } else {
    utils.logError('SOX:Invalid data format');
    return;
  }
}
function pushEvent(eventType, args) {
  if (eventType === bidRequestConst) {
    if (checkAdUnitConfig()) {
      args.bids = filterBidsByAdUnit(args.bids);
    }
    if (args.bids.length > 0) {
      eventStack.events.push({ eventType: eventType });
    }
  } else {
    if (isValidEvent(eventType, args.adUnitCode)) {
      eventStack.events.push({ eventType: eventType, args: args });
    }
  }
}
adapterManager.registerAnalyticsAdapter({
  adapter: openxAdapter,
  code: 'openx'
});

export default openxAdapter;
