import adapter from '../src/AnalyticsAdapter.js';
import CONSTANTS from '../src/constants.json';
import adapterManager from '../src/adapterManager.js';
import { ajax } from '../src/ajax.js';
const utils = require('../src/utils.js');

export const AUCTION_STATES = {
  INIT: 'initialized', // auction has initialized
  ENDED: 'ended', // all auction requests have been accounted for
  COMPLETED: 'completed' // all slots have rendered
};



const ADAPTER_VERSION = '0.1';
const SCHEMA_VERSION = '0.1';

const AUCTION_END_WAIT_TIME = 1000;
const URL_PARAM = '';
const ANALYTICS_TYPE = 'endpoint';
const ENDPOINT = 'https://prebid.openx.net/ox/analytics';

// Event Types
const {
  EVENTS: { AUCTION_INIT, BID_REQUESTED, BID_RESPONSE, BID_TIMEOUT, AUCTION_END, BID_WON }
} = CONSTANTS;
const SLOT_LOADED = 'slotOnload';

const UTM_TAGS = [
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

/**
 * @typedef {Object} OxAnalyticsConfig
 * @property {string} publisherPlatformId
 * @property {number} publisherAccountId
 * @property {number} sampling
 * @property {boolean} enableV2
 * @property {boolean} testPipeline
 * @property {Object} campaign
 * @property {number} payloadWaitTime
 * @property {number} payloadWaitTimePadding
 * @property {Array<string>} adUnits
 */

/**
 * @type {OxAnalyticsConfig}
 */
const DEFAULT_ANALYTICS_CONFIG = {
  publisherPlatformId: void (0),
  publisherAccountId: void (0),
  sampling: 0.05, // default sampling rate of 5%
  testCode: 'default',
  campaign: {},
  adUnits: [],
  payloadWaitTime: AUCTION_END_WAIT_TIME,
  payloadWaitTimePadding: 2000
};


// Initialization
/**
 * @type {OxAnalyticsConfig}
 */
let analyticsConfig;
let auctionMap = {};
let auctionOrder = 1; // tracks the number of auctions ran on the page

let googletag = window.googletag || {};
googletag.cmd = googletag.cmd || [];

let openxAdapter = Object.assign(adapter({ urlParam: URL_PARAM, analyticsType: ANALYTICS_TYPE }));

openxAdapter.originEnableAnalytics = openxAdapter.enableAnalytics;

openxAdapter.enableAnalytics = function(adapterConfig = {options: {}}) {
  if (isValidConfig(adapterConfig)) {
    analyticsConfig = {...DEFAULT_ANALYTICS_CONFIG, ...adapterConfig.options};

    // campaign properties defined by config will override utm query parameters
    analyticsConfig.campaign = {...buildCampaignFromUtmCodes(), ...analyticsConfig.campaign};

    utils.logInfo('OpenX Analytics enabled with config', analyticsConfig);

    // override track method with v2 handlers
    openxAdapter.track = prebidAnalyticsEventHandler;

    googletag.cmd.push(function () {
      googletag.pubads().addEventListener(SLOT_LOADED, args => {
        openxAdapter.track({eventType: SLOT_LOADED, args});
        utils.logInfo('OX: SlotOnLoad event triggered');
      });
    });

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

adapterManager.registerAnalyticsAdapter({
  adapter: openxAdapter,
  code: 'openx'
});

export default Object.assign({
  adapter: openxAdapter,
  auctionEndWaitTime: AUCTION_END_WAIT_TIME
});

/**
 * Test Helper Functions
 */

// reset the cache for unit tests
openxAdapter.reset = function() {
  auctionMap = {};
  auctionOrder = 1;
};

/**
 * Private Functions
 */

function buildCampaignFromUtmCodes() {
  let campaign = {};
  let queryParams = utils.parseQS(utils.getWindowLocation() && utils.getWindowLocation().search);

  UTM_TAGS.forEach(function(utmKey) {
    let utmValue = queryParams[utmKey];
    if (utmValue) {
      let key = UTM_TO_CAMPAIGN_PROPERTIES[utmKey];
      campaign[key] = utmValue;
    }
  });
  return campaign;
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

function prebidAnalyticsEventHandler({eventType, args}) {
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
    adapterVersion: ADAPTER_VERSION,
    schemaVersion: SCHEMA_VERSION,
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
    userIdProviders: buildUserIdProviders(userIds),
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

  function buildUserIdProviders(userIds) {
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
    }).reduce(utils.flatten, []);
  }

  function getMediaTypes(mediaTypes) {
    return utils._map(mediaTypes, (mediaTypeConfig, mediaType) => mediaType);
  }
}

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
