import { config } from 'src/config';
import { registerBidder } from '../src/adapters/bidderFactory';
import {BANNER, VIDEO} from '../src/mediaTypes';
import * as utils from '../src/utils';

const bidderConfig = 'hb_pb_rtb';
const bidderVersion = '3.x.x';

export const spec = {
  code: 'openxrtb',
  supportedMediaTypes: [BANNER, VIDEO],
  isBidRequestValid,
  buildRequests,
  interpretResponse,
  getUserSyncs,
};

registerBidder(spec);

/**
 * from openxBidAdapter
 * ported for feature parity
 * @param bidRequest
 * @return {boolean}
 */
function isBidRequestValid(bidRequest) {
  const hasDelDomainOrPlatform = bidRequest.params.delDomain
    || bidRequest.params.platform;

  if (utils.deepAccess(bidRequest, 'mediaTypes.banner')
      && hasDelDomainOrPlatform) {
    return !!bidRequest.params.unit
      || utils.deepAccess(bidRequest, 'mediaTypes.banner.sizes.length') > 0;
  }

  return !!(bidRequest.params.unit && hasDelDomainOrPlatform);
}

let impToBidIdMap = {};
function buildRequests(validBidRequests, bidderRequest) {
  const hasBids = bidderRequest.bids.length > 0;
  const transactionID = hasBids ? bidderRequest.bids[0].transactionId : null;
  if (!hasBids || !transactionID) {
    return [];
  }

  const bc = bidderRequest.bids[0].params.bc || `${bidderConfig}_${bidderVersion}`;
  const delDomain = bidderRequest.bids[0].params.delDomain || null;
  const platformId = bidderRequest.bids[0].params.platform || null;
  const configPageUrl = config.getConfig('pageUrl');
  const commonImpFieldsMap = getCommonImpFieldsMap(bidderRequest,
    delDomain, platformId);
  const maybeDoNotTrack = () => !window.navigator.doNotTrack
    ? {}
    : {dnt: window.navigator.doNotTrack};
  const maybePlatformIdOrDelDomain = ((delDomain, platId) => {
    let fields = {};
    if (platId) {
      fields = {...fields, platformId: platId};
    }
    if (delDomain) {
      fields = {...fields, delDomain};
    }
    return fields;
  });

  // update imp to bid map with current request bids
  impToBidIdMap = validBidRequests.reduce((impMap, bidRequest) => ({
    ...impMap,
    [bidRequest.transactionId]: bidRequest.bidId,
  }), {});
  const data = {
    id: bidderRequest.auctionId,
    cur: ['USD'],
    at: 1,   // (1: first-price-, 2: second-price-) auction
    tmax: config.getConfig('bidderTimeout'),  // defaults to 3000msecs
    site: {
      domain: configPageUrl || utils.getWindowTop().location.hostname,
      page: configPageUrl
              || bidderRequest.refererInfo.canonicalUrl
              || bidderRequest.refererInfo.referer,
      ref: bidderRequest.refererInfo.referer,
    },
    user: getUser(validBidRequests[0].userId, validBidRequests[0].userIdAsEids),
    regs: {
      coppa: config.getConfig('coppa') === true ? 1 : 0,
    },
    ext: {
      ...maybePlatformIdOrDelDomain(delDomain, platformId),
      bc,
    },
    imp: getImps(validBidRequests, commonImpFieldsMap),
    device: {
      ...maybeDoNotTrack(),
      ua: window.navigator.userAgent,
      language: window.navigator.language.split('-').shift(),
    },
  };
  return [{
    method: 'POST',
    url: 'https://rtb.openx.net/openrtbb/prebidjs',
    data,
    options: {
      contentType: 'application/json',
    }
  }];
}

/**
 * converts any valid bid request to an impression field
 * see: http://prebid.org/dev-docs/bidder-adaptor.html#bidrequest-parameters
 * @param validBidRequests
 * @param commonImpFieldsMap
 * @return openRTB imp[]
 */
function getImps(validBidRequests, commonImpFieldsMap) {
  const maybeImpExt = customParams => customParams ? {ext: {customParams}} : {};
  const maybeImpRegs = regs => Object.keys(regs.ext).length > 0 ? {regs} : null;
  const maybeImpUser = user => Object.keys(user.ext).length > 0 ? {user} : null;

  return validBidRequests.map(bidRequest => ({
    id: bidRequest.transactionId,
    tagid: bidRequest.params.unit,
    bidfloor: bidRequest.params.customFloor || 0,  //default bidfloorcurrency is USD
    ...getBannerImp(bidRequest),
    ...getVideoImp(bidRequest),
    ...maybeImpRegs(commonImpFieldsMap.regs),
    ...maybeImpUser(commonImpFieldsMap.user),
    ...maybeImpExt(bidRequest.params.customParams),
  }));
}

function getBannerImp(bidRequest) {
  if (!bidRequest.mediaTypes.banner) {
    return null;
  }
  // each size element is of the format [w, h]
  // mediaTypeSizes is an array of size elements, e.g. [[w, h], [w, h], ...]
  const toBannerImpFormatArray = mediaTypeSizes =>
    mediaTypeSizes.map(([w, h]) => ({w, h}));
  return {
    banner: {
      id: bidRequest.bidId,
      topframe: utils.inIframe() ? 1 : 0,
      format: toBannerImpFormatArray(bidRequest.mediaTypes.banner.sizes),
    },
  };
}

/**
 * for the openrtb param, see: https://docs.openx.com/Content/developers/containers/prebid-video-adapter.html
 * @param bidRequest
 * @return {null|{video: {w: *, h: *, id: number}}}
 */
function getVideoImp(bidRequest) {
  if (!bidRequest.mediaTypes.video) {
    return null;
  }
  if (bidRequest.params.openrtb) {
    return {
      video: {...bidRequest.params.openrtb, id: 1},
    };
  }
  const [w, h] = bidRequest.mediaTypes.video.playerSize[0];
  return {
    video: {
      id: bidRequest.bidId,
      w,
      h,
    },
  };
}

/**
 * typical fields are gdpr, usp and maybe global hb_pb settings
 * @param bidderRequest see auction.js:L30
 * @param delDomain string?
 * @param platformId string?
 * @return {{ext: {customParams: ?}, regs: {ext: {us_privacy: string, gdpr: boolean}}, user: {ext: {consent: string}}}}
 */
function getCommonImpFieldsMap(bidderRequest, delDomain, platformId) {
  const doesGdprApply = utils.deepAccess(bidderRequest,
    'gdprConsent.gdprApplies', null);
  const maybeEmptyGdprConsentString = utils.deepAccess(bidderRequest,
    'gdprConsent.consentString', null);

  const stripNullVals = map =>
    Object.entries(map)
      .filter(([key, val]) => null !== val)    // filter out null values
      // convert the rest back to fields
      .reduce((newMap, [key, val]) => ({
        ...newMap,
        [key]: typeof val !== 'object' ? val : stripNullVals(val),
      }), {});

  return stripNullVals({
    regs: {
      ext: {
        gdpr: doesGdprApply !== null ? !!doesGdprApply : null,
        us_privacy: bidderRequest.uspConsent || null,
      },
    },
    user: {
      ext: {
        consent: maybeEmptyGdprConsentString,
      },
    },
  });
}

/**
 * gets a userId field by parsing pbjs user id module enrichments
 * @param userIdDataMap
 * @param eids openrtb eids https://github.com/prebid/Prebid.js/blob/3.12.0/modules/userId/index.js#L280
 */
function getUser(userIdDataMap, eids) {
  if (!userIdDataMap) {
    return {};
  }

  const maybeDigitrust = getMaybeDigitrustId(userIdDataMap);
  return {
    ext: {
      eids,
      ...maybeDigitrust,
    }
  };

  function getMaybeDigitrustId(userIdDataMap) {
    const maybeDigitrustData = userIdDataMap.digitrustid && userIdDataMap.digitrustid.data;
    const {id, keyv} = maybeDigitrustData || {};
    if (!id) {
      return null;
    }
    return {digitrust: {id, keyv,}};
  }
}

function interpretResponse(resp, req) {
  const oxSeatBidName = 'OpenX';
  const oxDefaultBidRespTTLSecs = 300;
  const respBody = resp.body;
  if ('nbr' in respBody) {
    return [];
  }
  const oxSeatBid = respBody.seatbid
    .find(seatbid => seatbid.seat === oxSeatBidName) || {bid: []};

  return oxSeatBid.bid.map(bid => ({
    requestId: impToBidIdMap[bid.impid],
    cpm: bid.price,
    width: bid.w,
    height: bid.h,
    creativeId: bid.crid,
    dealId: bid.dealid,
    currency: respBody.cur || "USD",
    netRevenue: true,  // true?
    ttl: oxDefaultBidRespTTLSecs,  // secs before the bid expires and become unusable, from oxBidAdapter
    ad: bid.adm,
  }));
}

/**
 * from openxBidAdapter
 * ported for feature parity
 * @param syncOptions
 * @param responses
 * @param gdprConsent
 * @param uspConsent
 * @return {{type: (string), url: (*|string)}[]}
 */
function getUserSyncs(syncOptions, responses, gdprConsent, uspConsent) {
  if (syncOptions.iframeEnabled || syncOptions.pixelEnabled) {
    let pixelType = syncOptions.iframeEnabled ? 'iframe' : 'image';
    let url = utils.deepAccess(responses, '0.body.ads.pixels') ||
      utils.deepAccess(responses, '0.body.pixels') ||
      getDefaultSyncUrl(gdprConsent, uspConsent);

    return [{
      type: pixelType,
      url: url
    }];
  }
}

function getDefaultSyncUrl(gdprConsent, uspConsent) {
  let url = 'https://u.openx.net/w/1.0/pd';
  let queryParamStrings = [];

  if (gdprConsent) {
    queryParamStrings.push('gdpr=' + (gdprConsent.gdprApplies ? 1 : 0));
    queryParamStrings.push('gdpr_consent=' + encodeURIComponent(gdprConsent.consentString || ''));
  }

  // CCPA
  if (uspConsent) {
    queryParamStrings.push('us_privacy=' + encodeURIComponent(uspConsent));
  }

  return `${url}${queryParamStrings.length > 0 ? '?' + queryParamStrings.join('&') : ''}`;
}

